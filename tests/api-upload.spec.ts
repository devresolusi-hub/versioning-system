import 'dotenv/config';
import { describe, it, afterAll, expect } from 'vitest';
import { POST } from '../src/routes/api/upload/+server';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

// Integration tests hitting the real Supabase project.
// Requires environment variables set in .env:
// - PUBLIC_SUPABASE_URL
// - PUBLIC_SUPABASE_ANON_KEY
// - SUPABASE_SERVICE_ROLE_KEY
// - GITLAB_API_KEY (active key_value in api_keys)

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const PUBLIC_SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GITLAB_API_KEY = process.env.GITLAB_API_KEY;

console.log("PUBLIC_SUPABASE_URL:", PUBLIC_SUPABASE_URL);
console.log("PUBLIC_SUPABASE_ANON_KEY:", PUBLIC_SUPABASE_ANON_KEY);
console.log("SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_ROLE_KEY);
console.log("GITLAB_API_KEY:", GITLAB_API_KEY);

const missingEnv = [
	['PUBLIC_SUPABASE_URL', PUBLIC_SUPABASE_URL],
	['PUBLIC_SUPABASE_ANON_KEY', PUBLIC_SUPABASE_ANON_KEY],
	['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
	['GITLAB_API_KEY', GITLAB_API_KEY]
].filter(([, v]) => !v);

const serviceClient =
	PUBLIC_SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
		? createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
				auth: { autoRefreshToken: false, persistSession: false }
			})
		: null;

type CreatedArtifact = {
	fileName: string;
	version: string;
	objectPath: string;
};

const created: CreatedArtifact[] = [];

const routeUrlBase = process.env.ROUTE_URL ? process.env.ROUTE_URL.replace(/\/$/, '') : 'http://localhost:5173';
const routeUrl = `${routeUrlBase}/api/upload`;

function buildRequest(body: FormData, apiKey?: string) {
	const headers: Record<string, string> = {};
	if (apiKey) {
		headers['authorization'] = `Bearer ${apiKey}`;
	}
	return new Request(routeUrl, {
		method: 'POST',
		headers,
		body
	});
}

function makeFile(content: string | Uint8Array, filename: string, type = 'application/octet-stream') {
	const blob = typeof content === 'string' ? new Blob([content], { type }) : new Blob([content], { type });
	return new File([blob], filename, { type });
}

async function uploadOnce(params: {
	fileName: string;
	version: string;
	metadata?: Record<string, unknown>;
	apiKey?: string;
	fileContent?: string | Uint8Array;
	fileType?: string;
}) {
	const {
		fileName,
		version,
		metadata,
		apiKey = GITLAB_API_KEY!,
		fileContent = 'hello',
		fileType = 'text/plain'
	} = params;

	const form = new FormData();
	form.append('file', makeFile(fileContent, `${fileName}-${version}.txt`, fileType));
	form.append('fileName', fileName);
	form.append('version', version);
	if (metadata) {
		form.append('metadata', JSON.stringify(metadata));
	}

	const req = buildRequest(form, apiKey);
	const res = await POST({ request: req } as any);
	return res;
}

async function jsonFrom(res: Response) {
	return (await res.json()) as any;
}

// Cleanup: remove created versions and storage objects
async function cleanup() {
	if (created.length === 0 || !serviceClient) return;

	// Remove storage objects
	const toRemove = created.map((c) => `${c.fileName}/${c.version}/${path.basename(c.objectPath)}`);
	try {
		await serviceClient.storage.from('files').remove(toRemove);
	} catch (err) {
		console.error('Cleanup storage remove failed:', err);
	}

	// Remove version rows and file_metadata rows
	for (const c of created) {
		try {
			const storagePath = `files/${c.fileName}/${c.version}/${path.basename(c.objectPath)}`;
			await serviceClient.from('versions').delete().eq('storage_path', storagePath);
			// Remove file_metadata if no versions remain
			const { data: remaining } = await serviceClient
				.from('versions')
				.select('id')
				.eq('storage_path', storagePath)
				.limit(1);
			if (!remaining || remaining.length === 0) {
				await serviceClient.from('file_metadata').delete().eq('file_name', c.fileName);
			}
		} catch (err) {
			// Best-effort cleanup
			console.error('Cleanup DB failed:', err);
		}
	}
}

const runTests = missingEnv.length === 0;

const suite = runTests ? describe : describe.skip;

suite('POST /api/upload (live Supabase)', () => {
	const baseFile = `ci-test-${Date.now()}`;
	const version1 = '1.0.0';
	const bigBuffer = new Uint8Array(100 * 1024 * 1024 + 1); // just over 100MB

	afterAll(async () => {
		await cleanup();
	});

	it('returns 201 on success', async () => {
		const fileName = `${baseFile}-success`;
		const res = await uploadOnce({
			fileName,
			version: version1,
			metadata: { commit: 'abc123' }
		});
		expect(res.status).toBe(201);
		const body = await jsonFrom(res);
		expect(body.success).toBe(true);
		expect(body.data?.fileName).toBe(fileName);
		expect(body.data?.version).toBe(version1);
		expect(body.data?.downloadUrl).toBeDefined();

		created.push({
			fileName,
			version: version1,
			objectPath: body.data.storagePath ?? `files/${fileName}/${version1}/${fileName}-${version1}.txt`
		});
	});

	it('returns 409 on duplicate version', async () => {
		const fileName = `${baseFile}-duplicate`;
		const res1 = await uploadOnce({ fileName, version: version1 });
		expect(res1.status).toBe(201);
		const body1 = await jsonFrom(res1);
		created.push({
			fileName,
			version: version1,
			objectPath: body1.data.storagePath ?? `files/${fileName}/${version1}/${fileName}-${version1}.txt`
		});

		const res2 = await uploadOnce({ fileName, version: version1 });
		expect(res2.status).toBe(409);
	});

	it('returns 401 when missing Authorization', async () => {
		const form = new FormData();
		form.append('file', makeFile('x', 'a.txt'));
		form.append('fileName', 'missing-auth');
		form.append('version', '1.0.0');

		const req = buildRequest(form);
		const res = await POST({ request: req } as any);
		expect(res.status).toBe(401);
	});

	it('returns 401 when API key is invalid', async () => {
		const form = new FormData();
		form.append('file', makeFile('x', 'a.txt'));
		form.append('fileName', 'invalid-key');
		form.append('version', '1.0.0');

		const req = buildRequest(form, 'invalid-key');
		const res = await POST({ request: req } as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 when file is missing', async () => {
		const form = new FormData();
		form.append('fileName', 'missing-file');
		form.append('version', '1.0.0');

		const req = buildRequest(form, GITLAB_API_KEY);
		const res = await POST({ request: req } as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 when fileName is missing', async () => {
		const form = new FormData();
		form.append('file', makeFile('x', 'a.txt'));
		form.append('version', '1.0.0');

		const req = buildRequest(form, GITLAB_API_KEY);
		const res = await POST({ request: req } as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 when version is missing', async () => {
		const form = new FormData();
		form.append('file', makeFile('x', 'a.txt'));
		form.append('fileName', 'missing-version');

		const req = buildRequest(form, GITLAB_API_KEY);
		const res = await POST({ request: req } as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 when fileName is invalid', async () => {
		const form = new FormData();
		form.append('file', makeFile('x', 'a.txt'));
		form.append('fileName', 'bad name!');
		form.append('version', '1.0.0');

		const req = buildRequest(form, GITLAB_API_KEY);
		const res = await POST({ request: req } as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 when version is invalid', async () => {
		const form = new FormData();
		form.append('file', makeFile('x', 'a.txt'));
		form.append('fileName', 'good-name');
		form.append('version', 'bad version');

		const req = buildRequest(form, GITLAB_API_KEY);
		const res = await POST({ request: req } as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 when metadata is invalid JSON', async () => {
		const form = new FormData();
		form.append('file', makeFile('x', 'a.txt'));
		form.append('fileName', 'bad-metadata');
		form.append('version', '1.0.0');
		form.append('metadata', 'not-json');

		const req = buildRequest(form, GITLAB_API_KEY);
		const res = await POST({ request: req } as any);
		expect(res.status).toBe(400);
	});

	it('returns 413 when file is too large (>100MB)', async () => {
		const form = new FormData();
		form.append('file', makeFile(bigBuffer, 'big.bin'));
		form.append('fileName', 'too-large');
		form.append('version', '1.0.0');

		const req = buildRequest(form, GITLAB_API_KEY);
		const res = await POST({ request: req } as any);
		expect(res.status).toBe(413);
	});
});

if (!runTests) {
	describe.skip('POST /api/upload (live Supabase)', () => {
		it('skipped because required env vars are missing', () => {
			expect(missingEnv.length).toBe(0);
		});
	});
}

