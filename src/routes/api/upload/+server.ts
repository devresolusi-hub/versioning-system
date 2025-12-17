import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
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
	// 5. Upload file to Supabase Storage
	// -----------------------------------------------------------------------
	const originalFileName = file.name || `${trimmedFileName}-${trimmedVersion}`;
	const originalContentType = file.type || 'application/octet-stream';

	// Decide whether to compress before upload
	let objectPath: string;
	let storagePath: string;
	let contentType: string;
	let fileBuffer: Uint8Array;
	let storedFileSize: number;
	let storedFileType: string;
	let isCompressed = false;
	const originalFileSize = file.size;
	const originalFileType = originalContentType;

	try {
		if (file.size > SUPABASE_OBJECT_SIZE_LIMIT_BYTES) {
			// File is too large for a single Supabase object → compress to ZIP
			isCompressed = true;

			const zip = new JSZip();
			const originalArrayBuffer = await file.arrayBuffer();
			const originalUint8 = new Uint8Array(originalArrayBuffer);

			zip.file(originalFileName, originalUint8);

			const compressed = await zip.generateAsync({ type: 'uint8array' });

			const zipFileName = originalFileName.endsWith('.zip')
				? originalFileName
				: `${originalFileName}.zip`;

			objectPath = `${trimmedFileName}/${trimmedVersion}/${zipFileName}`;
			storagePath = `${STORAGE_BUCKET}/${objectPath}`;
			contentType = 'application/zip';
			fileBuffer = compressed;
			storedFileSize = compressed.length;
			storedFileType = contentType;

			if (storedFileSize > MAX_FILE_SIZE_BYTES) {
				return payloadTooLarge(
					'File is too large even after compression. Maximum allowed size is 100MB.'
				);
			}
		} else {
			// File is within Supabase object limit → upload as-is
			objectPath = `${trimmedFileName}/${trimmedVersion}/${originalFileName}`;
			storagePath = `${STORAGE_BUCKET}/${objectPath}`;
			contentType = originalContentType;
			const arrayBuffer = await file.arrayBuffer();
			fileBuffer = new Uint8Array(arrayBuffer);
			storedFileSize = file.size;
			storedFileType = contentType;
		}
	} catch (err) {
		console.error('Error preparing file for upload (compression step):', err);
		return internalError('Failed to prepare file for upload');
	}

	try {
		const { error: uploadError } = await supabase.storage
			.from(STORAGE_BUCKET)
			.upload(objectPath, fileBuffer, {
				contentType,
				cacheControl: '3600',
				upsert: false
			});

		if (uploadError) {
			console.error('Error uploading file to Supabase Storage:', uploadError);
			return internalError('Failed to upload file to storage');
		}
	} catch (err) {
		console.error('Unexpected error during storage upload:', err);
		return internalError('Failed to upload file to storage');
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
					compression: isCompressed ? 'zip' : 'none',
					originalFileSize,
					originalFileType
				},
				uploaded_by: uploaderName
			})
			.select('id, uploaded_at')
			.single();

		if (error || !data) {
			console.error('Error inserting version record, attempting to remove uploaded file:', error);
			// Best-effort rollback of storage upload
			try {
				await supabase.storage.from(STORAGE_BUCKET).remove([objectPath]);
			} catch (removeErr) {
				console.error('Error rolling back storage upload:', removeErr);
			}

			return internalError('Failed to create version record');
		}

		versionRecord = data as VersionRecord;
	} catch (err) {
		console.error('Unexpected error inserting version record:', err);
		// Best-effort rollback of storage upload
		try {
			await supabase.storage.from(STORAGE_BUCKET).remove([objectPath]);
		} catch (removeErr) {
			console.error('Error rolling back storage upload:', removeErr);
		}

		return internalError('Failed to create version record');
	}

	// -----------------------------------------------------------------------
	// 7. Generate download URL
	// -----------------------------------------------------------------------
	let downloadUrl: string | null = null;

	try {
		const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
		downloadUrl = data?.publicUrl ?? null;
	} catch (err) {
		console.error('Error generating public URL for storage object:', err);
	}

	// Fallback: construct URL manually if necessary
	if (!downloadUrl) {
		const supabaseUrl = PUBLIC_SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
		if (supabaseUrl) {
			downloadUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${storagePath}`;
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
				fileSize: file.size,
				fileType: contentType,
				downloadUrl,
				uploadedAt: versionRecord.uploaded_at,
				uploadedBy: uploaderName
			}
		},
		{ status: 201 }
	);
};


