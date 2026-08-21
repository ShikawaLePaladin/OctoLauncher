import path from 'node:path';

import fs from 'fs-extra';
import fetch from 'node-fetch';
import Logger from 'electron-log/main';

import Preferences from './preferences';

export type AddonStats = {
	stars: number | null;
	updatedAt: string | null;
};

type CacheEntry = AddonStats & { fetchedAt: number };
type Cache = Record<string, CacheEntry>;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// GitHub's unauthenticated API is capped at 60 req/hour — refresh a bounded
// batch of the stalest entries per call instead of the whole catalog, so a
// big addon list never blocks the UI or burns through the limit in one go.
// Gitea-flavored hosts don't share that constraint, but batching them the
// same way keeps this simple and still spreads the load over time.
const MAX_REFRESH_PER_CALL = 20;

const cachePath = () =>
	path.join(Preferences.userDataDir, 'addon-stats-cache.json');

let cache: Cache | null = null;

const loadCache = async (): Promise<Cache> => {
	if (cache) return cache;
	cache = await fs.readJSON(cachePath()).catch(() => ({}));
	return cache as Cache;
};

const saveCache = async () => {
	if (cache) await fs.writeJSON(cachePath(), cache, { spaces: 2 }).catch(() => {});
};

const parseGithubApiUrl = (git: string): string | null => {
	const m = git.match(/^https:\/\/github\.com\/([^/]+)\/([^/.]+?)(\.git)?\/?$/i);
	return m ? `https://api.github.com/repos/${m[1]}/${m[2]}` : null;
};

// gitea.com, codeberg.org (Forgejo, gitea-API-compatible), and octowow.st's
// own Gitea instance all expose the same /api/v1/repos/{owner}/{repo} shape.
const GITEA_HOSTS = ['gitea.com', 'codeberg.org', 'octowow.st'];

const parseGiteaApiUrl = (git: string): string | null => {
	try {
		const u = new URL(git.replace(/\.git$/, ''));
		if (!GITEA_HOSTS.includes(u.hostname)) return null;
		const [, owner, repo] = u.pathname.split('/');
		if (!owner || !repo) return null;
		return `https://${u.hostname}/api/v1/repos/${owner}/${repo}`;
	} catch {
		return null;
	}
};

const fetchOne = async (git: string): Promise<AddonStats> => {
	const apiUrl = parseGithubApiUrl(git) ?? parseGiteaApiUrl(git);
	if (!apiUrl) return { stars: null, updatedAt: null };
	try {
		const res = await fetch(apiUrl, {
			headers: { 'User-Agent': 'OctoLauncher' }
		});
		if (!res.ok) return { stars: null, updatedAt: null };
		const json = (await res.json()) as {
			stargazers_count?: number; // GitHub
			stars_count?: number; // Gitea
			pushed_at?: string; // GitHub: last push to any branch
			updated_at?: string; // both
		};
		return {
			stars: json.stargazers_count ?? json.stars_count ?? null,
			updatedAt: json.pushed_at ?? json.updated_at ?? null
		};
	} catch (e) {
		Logger.warn(`Addon stats fetch failed for ${git}`, e);
		return { stars: null, updatedAt: null };
	}
};

// Serves cached stats immediately and refreshes a bounded batch of the
// stalest/missing entries per call — repeated calls (tab re-opens) fill the
// rest of the catalog in gradually rather than fetching all at once.
export const getAddonStats = async (
	gitUrls: string[]
): Promise<Record<string, AddonStats>> => {
	const c = await loadCache();
	const now = Date.now();
	const stale = gitUrls.filter(
		g => !c[g] || now - c[g].fetchedAt > CACHE_TTL_MS
	);
	const toRefresh = stale.slice(0, MAX_REFRESH_PER_CALL);

	await Promise.all(
		toRefresh.map(async g => {
			c[g] = { ...(await fetchOne(g)), fetchedAt: now };
		})
	);
	if (toRefresh.length) await saveCache();

	const result: Record<string, AddonStats> = {};
	for (const g of gitUrls)
		result[g] = c[g]
			? { stars: c[g].stars, updatedAt: c[g].updatedAt }
			: { stars: null, updatedAt: null };
	return result;
};
