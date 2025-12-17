<script lang="ts">
	import type { PageData } from './$types';
	import type { FileView, FileVersionView } from './+page.server';

	let { data } = $props<{ data: PageData }>();

	const files = (data.files ?? []) as FileView[];
	const loadError = data.loadError as string | null;

	function formatBytes(bytes: number): string {
		if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let value = bytes;
		let unitIndex = 0;
		while (value >= 1024 && unitIndex < units.length - 1) {
			value /= 1024;
			unitIndex += 1;
		}
		return `${value.toFixed(value < 10 && unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
	}

	function formatDate(iso: string): string {
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return iso;
		return date.toLocaleString();
	}

	function hasVersions(file: FileView): boolean {
		return Array.isArray(file.versions) && file.versions.length > 0;
	}

	function latestVersion(file: FileView): FileVersionView | null {
		return hasVersions(file) ? file.versions[0] : null;
	}
</script>

<svelte:head>
	<title>File Versioning – Releases</title>
</svelte:head>

<main class="page">
	<section class="hero">
		<div class="hero-text">
			<h1>File Releases</h1>
			<p>Browse and download the latest published builds from your CI/CD pipelines.</p>
		</div>
	</section>

	{#if loadError}
		<section class="state state-error">
			<h2>Unable to load files</h2>
			<p>{loadError}</p>
		</section>
	{:else if files.length === 0}
		<section class="state state-empty">
			<h2>No files yet</h2>
			<p>Once your CI/CD pipeline uploads a build, it will appear here with all its versions.</p>
		</section>
	{:else}
		<section class="file-list">
			{#each files as file}
				<article class="file-card">
					<header class="file-header">
						<div>
							<h2>{file.fileName}</h2>
							<p class="file-meta">
								<span>Created: {formatDate(file.createdAt)}</span>
								<span>Last updated: {formatDate(file.updatedAt)}</span>
							</p>
						</div>
						{#if latestVersion(file)}
							<div class="latest-chip">
								<span class="chip-label">Latest</span>
								<span class="chip-version">v{latestVersion(file)!.version}</span>
							</div>
						{/if}
					</header>

					{#if !hasVersions(file)}
						<p class="no-versions">No versions uploaded yet.</p>
					{:else}
						<ul class="versions">
							{#each file.versions as version}
								<li class:latest={version.isLatest} class="version-row">
									<div class="version-main">
										<div class="version-title">
											<span class="version-badge">v{version.version}</span>
											{#if version.isLatest}
												<span class="badge-latest">Latest</span>
											{/if}
										</div>
										<div class="version-meta">
											<span>{formatBytes(version.fileSize)}</span>
											{#if version.fileType}
												<span>{version.fileType}</span>
											{/if}
											<span>Uploaded: {formatDate(version.uploadedAt)}</span>
										</div>
									</div>
									{#if version.downloadUrl}
										<div class="version-actions">
											<a
												class="button button-primary"
												href={version.downloadUrl}
												rel="noreferrer"
											>
												Download
											</a>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</article>
			{/each}
		</section>
	{/if}
</main>

<style>
	.page {
		max-width: 960px;
		margin: 0 auto;
		padding: 2.5rem 1.5rem 3rem;
		font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		color: #0f172a;
	}

	.hero {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.hero-text h1 {
		font-size: 2.1rem;
		margin: 0 0 0.4rem;
	}

	.hero-text p {
		margin: 0;
		color: #6b7280;
	}

	.state {
		border-radius: 0.75rem;
		padding: 1.5rem 1.25rem;
		margin-top: 1rem;
	}

	.state-empty {
		background: #f9fafb;
		border: 1px dashed #e5e7eb;
		text-align: center;
	}

	.state-error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #b91c1c;
	}

	.file-list {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.file-card {
		border-radius: 0.9rem;
		border: 1px solid #e5e7eb;
		background: #ffffff;
		padding: 1.25rem 1.25rem 1rem;
		box-shadow: 0 8px 20px rgba(15, 23, 42, 0.03);
	}

	.file-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}

	.file-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.file-meta {
		margin: 0.2rem 0 0;
		font-size: 0.8rem;
		color: #6b7280;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.latest-chip {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: #eff6ff;
		border-radius: 999px;
		padding: 0.2rem 0.75rem;
		font-size: 0.75rem;
		color: #1d4ed8;
		white-space: nowrap;
	}

	.latest-chip .chip-label {
		font-weight: 600;
	}

	.latest-chip .chip-version {
		opacity: 0.9;
	}

	.no-versions {
		margin: 0.5rem 0 0.25rem;
		font-size: 0.9rem;
		color: #9ca3af;
	}

	.versions {
		list-style: none;
		margin: 0.25rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.version-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		padding: 0.55rem 0.6rem;
		border-radius: 0.65rem;
		transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
	}

	.version-row:hover {
		background: #f9fafb;
		box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
		transform: translateY(-1px);
	}

	.version-row.latest {
		background: #eff6ff;
	}

	.version-main {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1 1 auto;
		min-width: 0;
	}

	.version-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.version-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.4rem;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		background: #111827;
		color: #f9fafb;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.badge-latest {
		font-size: 0.75rem;
		font-weight: 600;
		color: #1d4ed8;
		background: rgba(37, 99, 235, 0.1);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}

	.version-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		font-size: 0.8rem;
		color: #6b7280;
	}

	.version-actions {
		flex-shrink: 0;
	}

	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.4rem 0.9rem;
		border-radius: 999px;
		border: 1px solid transparent;
		font-size: 0.82rem;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease,
			box-shadow 0.15s ease, transform 0.1s ease;
	}

	.button-primary {
		background: #111827;
		color: #f9fafb;
		border-color: #111827;
	}

	.button-primary:hover {
		background: #020617;
		border-color: #020617;
		box-shadow: 0 6px 16px rgba(15, 23, 42, 0.25);
		transform: translateY(-1px);
	}

	@media (max-width: 640px) {
		.page {
			padding: 1.75rem 1rem 2.25rem;
		}

		.hero {
			margin-bottom: 1.25rem;
		}

		.hero-text h1 {
			font-size: 1.6rem;
		}

		.file-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.version-row {
			flex-direction: column;
			align-items: flex-start;
		}

		.version-actions {
			width: 100%;
		}

		.button {
			width: 100%;
			justify-content: center;
		}
	}
</style>
