import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

type VersionRow = {
	id: string;
	version: string;
	file_size: number;
	file_type: string | null;
	uploaded_at: string;
	storage_path: string;
	is_latest: boolean;
};

type FileRow = {
	id: string;
	file_name: string;
	created_at: string;
	updated_at: string;
	versions: VersionRow[] | null;
};

export type FileVersionView = {
	id: string;
	version: string;
	fileSize: number;
	fileType: string | null;
	uploadedAt: string;
	storagePath: string;
	isLatest: boolean;
	downloadUrl: string | null;
};

export type FileView = {
	id: string;
	fileName: string;
	createdAt: string;
	updatedAt: string;
	versions: FileVersionView[];
};

export const load: PageServerLoad = async () => {
	try {
		if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
			console.error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY');
			return {
				files: [] as FileView[],
				loadError: 'Server configuration error: Supabase environment variables are missing.'
			};
		}

		const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		const { data, error } = await supabase
			.from('file_metadata')
			.select(
				'id, file_name, created_at, updated_at, versions(id, version, file_size, file_type, uploaded_at, storage_path, is_latest)'
			)
			.order('updated_at', { ascending: false });

		if (error) {
			console.error('Error fetching file metadata:', error);
			return {
				files: [] as FileView[],
				loadError: 'Failed to load files. Please try again later.'
			};
		}

		const baseUrl = PUBLIC_SUPABASE_URL.replace(/\/$/, '');
		const downloadBase = `${baseUrl}/storage/v1/object/public`;

		const files: FileView[] = (data ?? []).map((row) => {
			const fileRow = row as FileRow;

			const versions = (fileRow.versions ?? [])
				.slice()
				.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
				.map<FileVersionView>((v) => {
					const storagePath = v.storage_path;
					// If storagePath is already a full URL (e.g. MEGA link), use it directly.
					// Otherwise, construct a Supabase public URL.
					const downloadUrl =
						storagePath.startsWith('http://') || storagePath.startsWith('https://')
							? storagePath
							: `${downloadBase}/${storagePath}`;

					return {
						id: v.id,
						version: v.version,
						fileSize: v.file_size,
						fileType: v.file_type,
						uploadedAt: v.uploaded_at,
						storagePath,
						isLatest: v.is_latest,
						downloadUrl
					};
				});

			return {
				id: fileRow.id,
				fileName: fileRow.file_name,
				createdAt: fileRow.created_at,
				updatedAt: fileRow.updated_at,
				versions
			};
		});

		return {
			files,
			loadError: null as string | null
		};
	} catch (err) {
		console.error('Unexpected error in home page load:', err);
		return {
			files: [] as FileView[],
			loadError: 'Unexpected error while loading files.'
		};
	}
};


