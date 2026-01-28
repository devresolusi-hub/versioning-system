import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

type VersionRow = {
	id: string;
	version: string;
	file_size: number;
	file_type: string | null;
	uploaded_at: string;
	file_url: string;
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
	fileUrl: string;
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
			return { releases: [], loadError: 'Supabase env vars missing.' };
		}
		const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
		const { data, error } = await supabase
			.from('versions')
			.select('*, file_metadata(*)')
			.order('uploaded_at', { ascending: false });

		if (error) {
			console.error('Error loading releases from Supabase:', error);
			return { releases: [], loadError: 'Failed to load releases' };
		}

		// Map database columns to frontend expectations
		const releases = data.map((version: any) => ({
			id: version.id,
			asset_name: version.file_metadata?.file_name ?? 'Unknown File',
			repo: 'project-versioning', // Default or derived
			tag: version.version,
			uploader: version.uploaded_by,
			published_at: version.uploaded_at,
			asset_size: version.file_size,
			fileUrl: version.file_url,
			is_latest: version.is_latest
		}));

		return { releases };
	} catch (err) {
		console.error('Unexpected error loading releases:', err);
		return { releases: [], loadError: 'Error loading releases' };
	}
};


