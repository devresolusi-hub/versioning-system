import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const FILE_NAME_REGEX = /^[A-Za-z0-9_-]+$/;
// Allow common version patterns: semantic versions, build numbers, tags
const VERSION_REGEX = /^[A-Za-z0-9._-]+$/;

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
	// 1. Parse and validate form data
	// -----------------------------------------------------------------------
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch (err) {
		console.error('Error parsing form data:', err);
		return badRequest('Invalid form data');
	}

	const fileName = formData.get('fileName');
	const version = formData.get('version');
	const fileUrl = formData.get('fileUrl');
	const fileSize = formData.get('fileSize');
	const fileType = formData.get('fileType');
	const metadataRaw = formData.get('metadata');

	if (typeof fileName !== 'string' || !fileName.trim()) {
		return badRequest('Missing required field: fileName');
	}

	if (typeof version !== 'string' || !version.trim()) {
		return badRequest('Missing required field: version');
	}

	if (typeof fileUrl !== 'string' || !fileUrl.trim()) {
		return badRequest('Missing required field: fileUrl');
	}

	if (typeof fileSize !== 'string' || !fileSize.trim()) {
		return badRequest('Missing required field: fileSize');
	}

	if (typeof fileType !== 'string' || !fileType.trim()) {
		return badRequest('Missing required field: fileType');
	}

	const trimmedFileName = fileName.trim();
	const trimmedVersion = version.trim();
	const trimmedFileUrl = fileUrl.trim();
	const trimmedFileType = fileType.trim();

	if (!FILE_NAME_REGEX.test(trimmedFileName)) {
		return badRequest('Invalid fileName format. Use only letters, numbers, dash, and underscore.');
	}

	if (!VERSION_REGEX.test(trimmedVersion)) {
		return badRequest('Invalid version format.');
	}

	const parsedFileSize = parseInt(fileSize, 10);
	if (!Number.isFinite(parsedFileSize) || parsedFileSize <= 0) {
		return badRequest('Invalid fileSize value.');
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
	// 4. Get or create file_metadata record
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
	// 5. Duplicate version check
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
	// 6. Create versions record
	// -----------------------------------------------------------------------
	let versionRecord: VersionRecord | null = null;

	try {
		const { data, error } = await supabase
			.from('versions')
			.insert({
				file_metadata_id: fileMetadata.id,
				version: trimmedVersion,
				file_url: trimmedFileUrl,
				file_size: parsedFileSize,
				file_type: trimmedFileType,
				metadata: metadata ?? {},
				uploaded_by: uploaderName
			})
			.select('id, uploaded_at')
			.single();

		if (error || !data) {
			console.error('Error inserting version record:', error);
			return internalError('Failed to create version record');
		}

		versionRecord = data as VersionRecord;
	} catch (err) {
		console.error('Unexpected error inserting version record:', err);
		return internalError('Failed to create version record');
	}

	return json(
		{
			success: true,
			message: 'File version registered successfully',
			data: {
				fileMetadataId: fileMetadata.id,
				versionId: versionRecord.id,
				fileName: trimmedFileName,
				version: trimmedVersion,
				fileUrl: trimmedFileUrl,
				fileSize: parsedFileSize,
				fileType: trimmedFileType,
				uploadedAt: versionRecord.uploaded_at,
				uploadedBy: uploaderName
			}
		},
		{ status: 201 }
	);
};