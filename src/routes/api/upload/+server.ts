import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Storage as MegaStorage } from 'megajs';
import { SUPABASE_SERVICE_ROLE_KEY, MEGA_EMAIL, MEGA_PASSWORD } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB (absolute limit for requests)
const SUPABASE_OBJECT_SIZE_LIMIT_BYTES = 50 * 1024 * 1024; // 50MB (per-object limit in Supabase Storage)
const FILE_NAME_REGEX = /^[A-Za-z0-9_-]+$/;
// Allow common version patterns: semantic versions, build numbers, tags
const VERSION_REGEX = /^[A-Za-z0-9._-]+$/;
const STORAGE_BUCKET = 'files';

type ApiKeyRecord = {
	id: string;
	key_name: string;
	is_active: boolean;
};

type FileMetadataRecord = {
	id: string;
	file_name: string;
};

type VersionRecord = {
	id: string;
	uploaded_at: string;
};

type StorageProvider = 'supabase' | 'mega';

function getSupabaseServiceClient(): SupabaseClient {
	// Use SvelteKit env, falling back to process.env for test runners
	const supabaseUrl = PUBLIC_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !serviceRoleKey) {
		console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
		throw new Error('Server configuration error');
	}

	return createClient(supabaseUrl, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}

async function getMegaClient() {
	// Use environment variables (from .env/.env.local)
	const email = MEGA_EMAIL ?? process.env.MEGA_EMAIL;
	const password = MEGA_PASSWORD ?? process.env.MEGA_PASSWORD;
	if (!email || !password) {
		console.error('Missing MEGA_EMAIL or MEGA_PASSWORD in environment.');
		throw new Error('MEGA configuration error');
	}

	const storage = new MegaStorage({
		email,
		password
	});

	await storage.ready;
	return storage;
}

function badRequest(message: string) {
	return json(
		{
			success: false,
			error: 'Bad Request',
			message
		},
		{ status: 400 }
	);
}

function unauthorized(message = 'Invalid or inactive API key') {
	return json(
		{
			success: false,
			error: 'Unauthorized',
			message
		},
		{ status: 401 }
	);
}

function conflict(message: string) {
	return json(
		{
			success: false,
			error: 'Conflict',
			message
		},
		{ status: 409 }
	);
}

function payloadTooLarge(message: string) {
	return json(
		{
			success: false,
			error: 'Payload Too Large',
			message
		},
		{ status: 413 }
	);
}

function internalError(message = 'An error occurred while processing your request') {
	return json(
		{
			success: false,
			error: 'Internal Server Error',
			message
		},
		{ status: 500 }
	);
}

export const POST: RequestHandler = async ({ request }) => {
	// -----------------------------------------------------------------------
	// 1. Parse and validate multipart/form-data (before touching Supabase)
	// -----------------------------------------------------------------------
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch (err) {
		console.error('Error parsing multipart/form-data:', err);
		return badRequest('Invalid multipart/form-data');
	}

	const file = formData.get('file');
	const fileName = formData.get('fileName');
	const version = formData.get('version');
	const metadataRaw = formData.get('metadata');

	if (!(file instanceof File)) {
		return badRequest('Missing required file field: file');
	}

	if (typeof fileName !== 'string' || !fileName.trim()) {
		return badRequest('Missing required field: fileName');
	}

	if (typeof version !== 'string' || !version.trim()) {
		return badRequest('Missing required field: version');
	}

	const trimmedFileName = fileName.trim();
	const trimmedVersion = version.trim();

	if (!FILE_NAME_REGEX.test(trimmedFileName)) {
		return badRequest('Invalid fileName format. Use only letters, numbers, dash, and underscore.');
	}

	if (!VERSION_REGEX.test(trimmedVersion)) {
		return badRequest('Invalid version format.');
	}

	if (!Number.isFinite(file.size) || file.size <= 0) {
		return badRequest('File is empty or has invalid size.');
	}

	if (file.size > MAX_FILE_SIZE_BYTES) {
		return payloadTooLarge('File size exceeds maximum allowed size of 100MB');
	}

	let metadata: Record<string, unknown> | null = null;
	if (typeof metadataRaw === 'string' && metadataRaw.trim()) {
		try {
			metadata = JSON.parse(metadataRaw);
			if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
				return badRequest('metadata must be a JSON object');
			}
		} catch (err) {
			console.error('Error parsing metadata JSON:', err);
			return badRequest('Invalid metadata JSON');
		}
	}

	// -----------------------------------------------------------------------
	// 2. Initialize Supabase client
	// -----------------------------------------------------------------------
	let supabase: SupabaseClient;
	try {
		supabase = getSupabaseServiceClient();
	} catch (err) {
		console.error('Supabase client initialization failed:', err);
		return internalError();
	}

	// -----------------------------------------------------------------------
	// 3. API key authentication
	// -----------------------------------------------------------------------
	const authHeader = request.headers.get('authorization');

	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return unauthorized('Missing or invalid Authorization header');
	}

	const providedKey = authHeader.replace('Bearer', '').trim();
	if (!providedKey) {
		return unauthorized('Missing API key');
	}

	let apiKey: ApiKeyRecord | null = null;

	try {
		const { data, error } = await supabase
			.from('api_keys')
			.select('id, key_name, is_active')
			.eq('key_value', providedKey)
			.eq('is_active', true)
			.limit(1)
			.maybeSingle();

		if (error || !data) {
			console.warn('API key validation failed:', error ?? 'No matching key');
			return unauthorized();
		}

		apiKey = data;

		// Update last_used_at timestamp (best-effort)
		await supabase
			.from('api_keys')
			.update({ last_used_at: new Date().toISOString() })
			.eq('id', apiKey.id);
	} catch (err) {
		console.error('Error validating API key:', err);
		return internalError();
	}

	const uploaderName = apiKey.key_name;

	// -----------------------------------------------------------------------
	// 3. Get or create file_metadata record
	// -----------------------------------------------------------------------
	let fileMetadata: FileMetadataRecord | null = null;

	try {
		const { data, error } = await supabase
			.from('file_metadata')
			.select('id, file_name')
			.eq('file_name', trimmedFileName)
			.limit(1);

		if (error) {
			console.error('Error querying file_metadata:', error);
			return internalError();
		}

		if (data && data.length > 0) {
			fileMetadata = data[0] as FileMetadataRecord;
		} else {
			const { data: inserted, error: insertError } = await supabase
				.from('file_metadata')
				.insert({ file_name: trimmedFileName })
				.select('id, file_name')
				.single();

			if (insertError || !inserted) {
				console.error('Error inserting file_metadata:', insertError);
				return internalError();
			}

			fileMetadata = inserted as FileMetadataRecord;
		}
	} catch (err) {
		console.error('Unexpected error handling file_metadata:', err);
		return internalError();
	}

	// -----------------------------------------------------------------------
	// 4. Duplicate version check
	// -----------------------------------------------------------------------
	try {
		const { data: existingVersions, error: versionError } = await supabase
			.from('versions')
			.select('id')
			.eq('file_metadata_id', fileMetadata.id)
			.eq('version', trimmedVersion)
			.limit(1);

		if (versionError) {
			console.error('Error checking existing versions:', versionError);
			return internalError();
		}

		if (existingVersions && existingVersions.length > 0) {
			return conflict(`Version ${trimmedVersion} already exists for file ${trimmedFileName}`);
		}
	} catch (err) {
		console.error('Unexpected error during duplicate version check:', err);
		return internalError();
	}

	// -----------------------------------------------------------------------
	// 5. Upload file to appropriate storage (Supabase or MEGA)
	// -----------------------------------------------------------------------
	const originalFileName = file.name || `${trimmedFileName}-${trimmedVersion}`;
	const originalContentType = file.type || 'application/octet-stream';
	const originalFileSize = file.size;
	const originalFileType = originalContentType;

	let storageProvider: StorageProvider;
	let objectPath: string | null = null;
	let storagePath: string;
	let contentType: string;
	let fileBuffer: Uint8Array;
	let storedFileSize: number;
	let storedFileType: string;
	let downloadUrl: string | null = null;

	try {
		console.info('Preparing file for upload', {
			originalFileName,
			originalFileSize,
			originalFileType,
			supabaseObjectSizeLimit: SUPABASE_OBJECT_SIZE_LIMIT_BYTES,
			maxRequestSize: MAX_FILE_SIZE_BYTES
		});

		const arrayBuffer = await file.arrayBuffer();
		fileBuffer = new Uint8Array(arrayBuffer);

		if (file.size <= SUPABASE_OBJECT_SIZE_LIMIT_BYTES) {
			// Use Supabase Storage for files within object size limit
			storageProvider = 'supabase';

			objectPath = `${trimmedFileName}/${trimmedVersion}/${originalFileName}`;
			storagePath = `${STORAGE_BUCKET}/${objectPath}`;
			contentType = originalContentType;
			storedFileSize = file.size;
			storedFileType = contentType;

			console.info('Routing upload to Supabase Storage', {
				objectPath,
				storedFileSize,
				storedFileType
			});
		} else {
			// Use MEGA for larger files
			storageProvider = 'mega';
			contentType = originalContentType;
			storedFileSize = file.size;
			storedFileType = contentType;

			console.info('Routing upload to MEGA storage', {
				originalFileName,
				storedFileSize,
				storedFileType
			});

			try {
				const mega = await getMegaClient();

				console.info('Uploading to MEGA...', {
					originalFileName,
					storedFileSize
				});

				const upload = mega.upload(
					{
						name: originalFileName,
						size: storedFileSize
					},
					Buffer.from(fileBuffer)
				);

				const uploadedFile = await new Promise<any>((resolve, reject) => {
					upload.on('complete', resolve);
					upload.on('error', reject);
				});

				const megaLink = await uploadedFile.link();

				storagePath = megaLink;
				downloadUrl = megaLink;

				console.info('Upload to MEGA completed', {
					originalFileName,
					megaLink
				});
			} catch (err) {
				console.error('Error uploading to MEGA:', err);
				return internalError('Failed to upload file to cloud storage');
			}
		}
	} catch (err) {
		console.error('Error preparing file for upload:', err);
		return internalError('Failed to prepare file for upload');
	}

	// If using Supabase, perform the storage upload now
		if (storageProvider === 'supabase' && objectPath) {
		try {
			console.info('Uploading to Supabase Storage', {
				bucket: STORAGE_BUCKET,
				objectPath,
				contentType,
				storedFileSize
			});

			const { error: uploadError } = await supabase.storage
				.from(STORAGE_BUCKET)
				.upload(objectPath!, fileBuffer, {
					contentType,
					cacheControl: '3600',
					upsert: false
				});

			if (uploadError) {
				console.error('Error uploading file to Supabase Storage:', uploadError, {
					message: (uploadError as Error).message,
					name: (uploadError as Error).name
				});
				return internalError('Failed to upload file to storage');
			}

			storagePath = `${STORAGE_BUCKET}/${objectPath}`;
		} catch (err) {
			console.error('Unexpected error during storage upload:', err, {
				bucket: STORAGE_BUCKET,
				objectPath,
				storedFileSize
			});
			return internalError('Failed to upload file to storage');
		}
	}

	// -----------------------------------------------------------------------
	// 6. Create versions record
	// -----------------------------------------------------------------------
	let versionRecord: VersionRecord | null = null;

	try {
		const { data, error } = await supabase
			.from('versions')
			.insert({
				file_metadata_id: fileMetadata.id,
				version: trimmedVersion,
				storage_path: storagePath,
				file_size: storedFileSize,
				file_type: storedFileType,
				metadata: {
					...(metadata ?? {}),
					storageProvider,
					originalFileSize,
					originalFileType
				},
				uploaded_by: uploaderName
			})
			.select('id, uploaded_at')
			.single();

		if (error || !data) {
			console.error('Error inserting version record, attempting to remove uploaded file:', error);
			// Best-effort rollback of storage upload (only for Supabase)
			if (storageProvider === 'supabase' && objectPath) {
				try {
					await supabase.storage.from(STORAGE_BUCKET).remove([objectPath]);
				} catch (removeErr) {
					console.error('Error rolling back storage upload:', removeErr);
				}
			}

			return internalError('Failed to create version record');
		}

		versionRecord = data as VersionRecord;
	} catch (err) {
		console.error('Unexpected error inserting version record:', err);
		// Best-effort rollback of Supabase storage upload (not applicable for MEGA)
		if (storageProvider === 'supabase' && objectPath) {
			try {
				await supabase.storage.from(STORAGE_BUCKET).remove([objectPath]);
			} catch (removeErr) {
				console.error('Error rolling back storage upload:', removeErr);
			}
		}

		return internalError('Failed to create version record');
	}

	// -----------------------------------------------------------------------
	// 7. Generate download URL
	// -----------------------------------------------------------------------
	if (storageProvider === 'supabase' && objectPath) {
		try {
			const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath as string);
			downloadUrl = data?.publicUrl ?? null;
		} catch (err) {
			console.error('Error generating public URL for storage object:', err);
		}
	}

	// Final rule:
	// - If we already have an HTTPS URL (Supabase public URL or MEGA link), use it.
	// - Otherwise, construct a Supabase public URL from storagePath.
	let finalDownloadUrl: string | null = null;
	if (downloadUrl && downloadUrl.includes('https://mega.nz')) {
		finalDownloadUrl = downloadUrl;
	} else {
		const supabaseUrl = PUBLIC_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
		if (supabaseUrl) {
			finalDownloadUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${storagePath}`;
		}
	}

	return json(
		{
			success: true,
			message: 'File uploaded successfully',
			data: {
				fileMetadataId: fileMetadata.id,
				versionId: versionRecord.id,
				fileName: trimmedFileName,
				version: trimmedVersion,
				storagePath,
				storageProvider,
				fileSize: storedFileSize,
				fileType: storedFileType,
				downloadUrl: finalDownloadUrl ?? storagePath,
				uploadedAt: versionRecord.uploaded_at,
				uploadedBy: uploaderName
			}
		},
		{ status: 201 }
	);
};