import path from 'node:path';

import git, { type ProgressCallback } from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import Logger from 'electron-log/main';

import { isNotUndef } from '~common/utils';
import { type AddonData, type TocData } from '~common/schemas';
import { runWorker } from '~main/utils';
import gitPull from '~main/workers/gitPull?nodeWorker';
import gitClone from '~main/workers/gitClone?nodeWorker';
import gitFetch from '~main/workers/gitFetch?nodeWorker';

import Preferences from './preferences';
import Observable from './observable';

export type AddonsStatus = {
	state: 'verifying' | 'done';
	addons: { [name: string]: AddonData };
	available: AddonData[];
};

export type AddonsList = {
	name: string;
	owner: string;
	branch?: string;
	ref?: string;
	git: string;
	toc?: TocData;
	description?: string;
	lastUpdated?: string;
	stars?: number;
	dependencies?: string[];
}[];

const readTocData = (content: string) =>
	(content.charCodeAt(0) === 0xfeff ? content.slice(1) : content)
		.split('\n')
		.filter(l => l.startsWith('## '))
		.map(l => l.slice(3))
		.map(l => {
			const idx = l.indexOf(':');
			if (idx === -1) return null;
			return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] as const;
		})
		.filter((e): e is readonly [string, string] => !!e)
		.reduce((acc, [key, value]) => {
			acc[key] = value;
			return acc;
		}, {} as TocData);

const isUnsafeFolder = (name?: string) =>
	!name || name === '.' || name === '..' || /[/\\]/.test(name);

const ALLOWED_GIT_HOSTS = [
	'github.com',
	'gitlab.com',
	'gitea.com',
	'codeberg.org',
	'octowow.st'
];

const isAllowedGitUrl = (url: string) => {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== 'https:') return false;
		const host = parsed.hostname.toLowerCase();
		return ALLOWED_GIT_HOSTS.some(h => host === h || host.endsWith('.' + h));
	} catch {
		return false;
	}
};

// A WoW addon is Lua/XML/TOC/textures — the client's Lua sandbox has no
// io/os/ffi access, so addon *code* can't touch the filesystem or run
// anything on its own. This check isn't a malware scanner (no tool can
// verify Lua is "safe"); it closes the one concrete gap a git-cloned addon
// folder has: nothing stops the repo from also shipping an actual
// executable that a confused player might double-click straight out of
// Interface\AddOns, or that later abuses some other unrelated exploit.
const DANGEROUS_EXTENSIONS = new Set([
	'.exe',
	'.dll',
	'.scr',
	'.bat',
	'.cmd',
	'.com',
	'.msi',
	'.ps1',
	'.vbs',
	'.vbe',
	'.js',
	'.jse',
	'.wsf',
	'.wsh',
	'.jar',
	'.lnk',
	'.reg',
	'.hta'
]);

const findDangerousFile = async (dir: string): Promise<string | null> => {
	const entries = await fs
		.readdir(dir, { withFileTypes: true })
		.catch(() => []);
	for (const entry of entries) {
		if (entry.name === '.git') continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			const found = await findDangerousFile(full);
			if (found) return found;
		} else if (
			DANGEROUS_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
		) {
			return full;
		}
	}
	return null;
};

// carries a `.code` so isLocalCorruption()/isUnrelatedHistory() both
// correctly treat this as an understood, non-retryable error instead of
// misclassifying it as local corruption and re-downloading the same
// dangerous repo before giving up.
class DangerousFileError extends Error {
	readonly code = 'DangerousFileError';
	constructor(fileName: string) {
		super(`Refused: repo contains an executable file (${fileName})`);
		this.name = 'DangerousFileError';
	}
}

// scan a freshly (re)populated addon folder and wipe it if it smuggled in an
// executable — called after every clone/pull, not just the manual "add by
// URL" flow, so this can't be bypassed by going through update()/#repair()
// instead of install().
const rejectIfDangerous = async (folder: string, dir: string): Promise<void> => {
	const dangerousFile = await findDangerousFile(dir);
	if (!dangerousFile) return;
	const fileName = path.basename(dangerousFile);
	await fs.remove(dir).catch(() => undefined);
	Logger.error(`Refusing addon "${folder}": contains ${fileName}`);
	throw new DangerousFileError(fileName);
};

// isomorphic-git throws typed errors (HttpError, NotFoundError, ...) with a
// string `code` for conditions it understands — auth failures, missing
// refs, network errors. A caught error WITHOUT that shape (a bare
// TypeError/RangeError from deep inside its packfile reader, which is what a
// corrupted local .git actually produces) means the local repo itself is
// broken, not the remote — that's the one case a fresh re-clone can fix.
const isLocalCorruption = (e: unknown): boolean =>
	e instanceof Error && typeof (e as { code?: unknown }).code !== 'string';

// thrown by git.pull() when the local history and the remote's don't share
// a common ancestor — expected right after a repo-moved repoint (the old
// clone's objects predate the new remote entirely), not something a merge
// can ever resolve. A fresh re-clone is the only fix, same as corruption.
const isUnrelatedHistory = (e: unknown): boolean =>
	e instanceof Error &&
	(e as { code?: unknown }).code === 'MergeNotSupportedError';

const errorDetail = (e: unknown): string => {
	if (!(e instanceof Error)) return String(e);
	const response = (e as { data?: { response?: unknown } }).data?.response;
	return typeof response === 'string' && response
		? `${e.message}: ${response}`
		: e.message;
};

export const fetchAddons = async () => {
	try {
		const response = await fetch(
			`${
				import.meta.env.MAIN_VITE_SERVER_URL || 'https://octowow.st'
			}/api/addons.json`
		);
		return (await response.json()) as AddonsList;
	} catch (e) {
		Logger.error('Failed to reach update server', e);
		return [];
	}
};

class AddonsClass extends Observable<AddonsStatus> {
	protected _value: AddonsStatus = {
		state: 'done',
		addons: {},
		available: []
	};

	get status() {
		return this._value;
	}
	private set status(v: AddonsStatus) {
		this._value = v;
		this._notifyObservers(v);
	}

	#onProgress =
		(folder: string, data: AddonData): ProgressCallback =>
		progress => {
			const getPhase = (step: string) => {
				switch (step) {
					case 'Counting objects':
						return 1;
					case 'Compressing objects':
						return 2;
					case 'Receiving objects':
						return 3;
					case 'Resolving deltas':
						return 4;
					case 'Analyzing workdir':
						return 5;
					case 'Updating workdir':
						return 6;
					default:
						return 0;
				}
			};
			this.#setAddon(folder, {
				...data,
				progress: `${Math.round(
					(progress.loaded / (progress.total ?? progress.loaded)) * 100
				)}% (${getPhase(progress.phase)}/6)`
			});
		};

	async checkGitUrl(url: string) {
		const clean = url.trim().replace(/\/+$/, '');
		const gitUrl = clean.endsWith('.git') ? clean : `${clean}.git`;
		if (!isAllowedGitUrl(gitUrl)) return undefined;
		try {
			await git.getRemoteInfo({
				http,
				url: gitUrl
			});

			let preview: string | undefined;
			try {
				if (isAllowedGitUrl(url)) {
					const response = await fetch(url).then(r => r.text());
					preview = response.match(
						/property="og:image" content="([^"]*)"/
					)?.[1];
				}
			} catch {}

			const folder = gitUrl.slice(0, -4).split('/').at(-1);
			if (isUnsafeFolder(folder)) return undefined;
			return {
				status: 'available',
				folder,
				git: gitUrl,
				preview
			} as AddonData;
		} catch {
			return undefined;
		}
	}

	// wipes the local folder and re-clones from scratch. Only called for
	// errors isLocalCorruption() has already identified as "the repo on disk
	// is broken", so losing whatever is currently there is safe — a fresh
	// clone is strictly better than a folder isomorphic-git can't read.
	async #repair(folder: string, dir: string, url: string, ref?: string) {
		Logger.warn(`Addon "${folder}": local repo unreadable, re-cloning`);
		// gitClone.ts already backs `dir` up to a .bak folder and restores it
		// if the fresh clone fails — deleting it here first would remove that
		// safety net and leave the addon folder empty on any clone failure.
		await runWorker(
			gitClone,
			{ dir, url, ref },
			{
				onProgress: this.#onProgress(folder, {
					status: 'downloading',
					folder
				})
			}
		);
		await rejectIfDangerous(folder, dir);
	}

	async verify() {
		if (this.status.state !== 'done') return;

		this.status = {
			...this.status,
			state: 'verifying'
		};

		const remoteAddons = await fetchAddons();
		const available: AddonData[] = remoteAddons.map(a => ({
			status: 'available',
			git: a.git,
			toc: a.toc,
			description: a.description,
			folder: a.name,
			branch: a.branch,
			ref: a.ref
		}));

		const clientPath = Preferences.data.clientDir;
		if (!clientPath) {
			this.status = { state: 'done', addons: {}, available };
			return;
		}

		const addonsPath = path.join(clientPath, 'Interface', 'Addons');
		const dirs = (await fs.pathExists(addonsPath))
			? await fs.readdir(addonsPath)
			: [];
		const addons: AddonsStatus['addons'] = Object.fromEntries(
			dirs
				.filter(d => !d.startsWith('Blizzard_') && !/\.(tmp|bak)$/.test(d))
				.map(name => [name, { status: 'fetching' as const, folder: name }])
		);

		this.status = { state: 'verifying', addons, available };

		const verifyOne = async (folder: string) => {
			const dir = path.join(addonsPath, folder);

			if (!fs.existsSync(path.join(dir, `${folder}.toc`))) {
				// a .git folder with no .toc means a previous clone/repair was
				// interrupted, not a manually-dropped non-git addon — retry it
				// instead of leaving it stuck on "invalid" forever.
				const avail = remoteAddons.find(a => a.name === folder);
				if (avail?.git && fs.existsSync(path.join(dir, '.git'))) {
					try {
						await this.#repair(folder, dir, avail.git, avail.ref);
						const repairedToc = readTocData(
							await fs.readFile(path.join(dir, `${folder}.toc`), 'utf-8')
						);
						this.#setAddon(folder, {
							git: avail.git,
							status: 'outOfDate',
							error: 'Re-installed after an interrupted download',
							toc: repairedToc,
							ref: avail.ref,
							folder
						});
						Logger.info(`Addon "${folder}" re-cloned successfully`);
						return;
					} catch (repairError) {
						Logger.error(`Addon "${folder}" repair failed`, repairError);
					}
				}
				this.#setAddon(folder, {
					status: 'invalid',
					error: 'Missing .toc file',
					folder
				});
				return;
			}

			const toc = await readTocData(
				await fs.readFile(path.join(dir, `${folder}.toc`), 'utf-8')
			);

			const remote = await git
				.listRemotes({ fs, dir })
				.then(r => r[0])
				.catch(() => null);

			const avail = remoteAddons.find(a => a.name === folder);
			if (!remote) {
				Logger.log(`Addon "${folder}" is not a git repository`);
				this.#setAddon(
					folder,
					avail
						? {
								status: 'outOfDate',
								git: avail.git,
								toc,
								description: avail.description,
								folder
						  }
						: { status: 'unknown', toc, folder }
				);
				return;
			}

			try {
				// same rationale as update(): a repo can be renamed/transferred
				// after this addon was originally cloned, leaving the local
				// remote pointed at a URL that now 401s instead of the
				// catalog's current one
				const repointUrl =
					avail?.git && remote.url !== avail.git && isAllowedGitUrl(avail.git)
						? avail.git
						: undefined;
				// git.fetch() is the one network- and CPU-heavy step here (a
				// large repo's full history can take minutes to parse) — run it
				// off the main thread so it can't freeze the renderer, same as
				// the clone/pull workers below.
				await runWorker(gitFetch, {
					dir,
					remoteName: remote.remote,
					repointUrl
				});
				if (repointUrl)
					Logger.info(`Addon "${folder}" remote repointed to ${repointUrl}`);

				const branch = await git.currentBranch({ fs, dir });

				const localCommit = await git
					.log({ fs, dir, ref: 'HEAD', depth: 1 })
					.then(r => r[0].oid)
					.catch(() => null);

				const remoteCommit = avail?.ref
					? await git.resolveRef({ fs, dir, ref: avail.ref }).catch(() => null)
					: await git
							.log({ fs, dir, ref: `${remote.remote}/${branch}`, depth: 1 })
							.then(r => r[0].oid)
							.catch(() => null);

				const status = await git.statusMatrix({ fs, dir });
				// row = [filepath, headStatus, workdirStatus, stageStatus]; a
				// file absent from both HEAD and the index (untracked, never
				// committed) can't mean "this addon fell behind" — it's a
				// shared library, a per-player config file, or similar,
				// bundled alongside the addon without being part of its git
				// history. Only count real drift on files git actually
				// tracks.
				const changedFiles = status.filter(([, head, workdir, stage]) => {
					if (head === 0 && stage === 0) return false;
					return head !== workdir || workdir !== stage;
				});
				const hasChanges = changedFiles.length > 0;

				const isUpToDate =
					!hasChanges && remoteCommit && localCommit === remoteCommit;
				// prefer the catalog's URL over `remote.url`, which was read
				// before the repoint above and would otherwise write the dead
				// URL right back into this addon's tracked state
				this.#setAddon(folder, {
					git: avail?.git ?? remote.url,
					status: isUpToDate ? 'upToDate' : 'outOfDate',
					toc,
					description: avail?.description,
					ref: avail?.ref,
					folder
				});

				Logger.log(
					isUpToDate
						? `Addon "${folder}" is up to date${
								avail?.ref ? ` (pinned ${avail.ref})` : ''
						  }`
						: `Addon "${folder}" has an update available`
				);
			} catch (e) {
				if (isLocalCorruption(e) || isUnrelatedHistory(e)) {
					try {
						const repairUrl = avail?.git ?? remote.url;
						await this.#repair(folder, dir, repairUrl, avail?.ref);
						const repairedToc = readTocData(
							await fs.readFile(path.join(dir, `${folder}.toc`), 'utf-8')
						);
						this.#setAddon(folder, {
							git: repairUrl,
							status: 'outOfDate',
							error: 'Re-installed after a local error',
							toc: repairedToc,
							ref: avail?.ref,
							folder
						});
						Logger.info(`Addon "${folder}" re-cloned successfully`);
						return;
					} catch (repairError) {
						Logger.error(`Addon "${folder}" repair failed`, repairError);
					}
				}
				this.#setAddon(folder, {
					git: avail?.git ?? remote.url,
					status: 'invalid',
					error: errorDetail(e),
					toc,
					folder
				});
				Logger.error(`Addon "${folder}" failed to verify`, e);
			}
		};

		const folders = Object.keys(addons);
		const VERIFY_CONCURRENCY = 6;
		let idx = 0;
		await Promise.all(
			Array.from(
				{ length: Math.min(VERIFY_CONCURRENCY, folders.length) },
				async () => {
					while (true) {
						const i = idx++;
						if (i >= folders.length) return;
						await verifyOne(folders[i]);
					}
				}
			)
		);

		this.status = { ...this.status, state: 'done' };
	}

	async update(
		toUpdate = Object.values(this.status.addons)
			.filter(e => e.status === 'outOfDate')
			.map(e => e.folder)
			.filter(isNotUndef)
	) {
		const clientPath = Preferences.data.clientDir;
		if (!clientPath) return;
		if (this.status.state !== 'done') {
			// a caller with an explicit list (e.g. a companion-addon
			// auto-install) has real work that's being silently dropped here —
			// the default empty-list startup call has nothing to lose either
			// way, so only warn when there was something to do.
			if (toUpdate.length)
				Logger.warn(
					`Addons.update(${toUpdate.join(', ')}) skipped: addons not yet verified`
				);
			return;
		}

		const addonsPath = path.join(clientPath, 'Interface', 'Addons');

		for (const folder of toUpdate) {
			if (this.status.addons[folder]?.status === 'downloading') continue;
			const dir = path.join(addonsPath, folder);

			const avail = this.status.available.find(a => a.folder === folder);
			const data: AddonData = {
				...avail,
				...this.status.addons[folder],
				status: 'downloading'
			};
			this.#setAddon(folder, data);

			const remote = await git
				.listRemotes({ fs, dir })
				.then(r => r?.[0])
				.catch(() => null);

			try {
				if (!remote) {
					await runWorker(
						gitClone,
						{ dir, url: data.git, ref: data.ref ?? data.branch },
						{ onProgress: this.#onProgress(folder, data) }
					);
				} else if (
					data.git &&
					remote.url !== data.git &&
					isAllowedGitUrl(data.git)
				) {
					// the catalog's URL for an addon can change (repo renamed or
					// transferred to a new owner). The old and new repos rarely
					// share commit history, so a pull would try to merge unrelated
					// trees and fail — re-clone fresh from the new URL instead.
					Logger.info(
						`Addon "${folder}" repo moved; re-cloning from ${data.git}`
					);
					await this.#repair(folder, dir, data.git, data.ref);
				} else {
					const branch =
						(await git.currentBranch({ fs, dir })) ?? avail?.branch ?? 'master';
					await runWorker(
						gitPull,
						{
							dir,
							remote: remote.remote,
							branch,
							ref: avail?.ref
						},
						{ onProgress: this.#onProgress(folder, data) }
					);
				}
				// covers the gitClone/gitPull branches above; #repair() already
				// scans internally, so this is a harmless re-check when that
				// branch was taken
				await rejectIfDangerous(folder, dir);
				const toc = readTocData(
					await fs.readFile(path.join(dir, `${folder}.toc`), 'utf-8')
				);

				this.#setAddon(folder, { ...data, toc, status: 'upToDate' });
				Logger.log(`Updated addon "${folder}"`);
			} catch (e) {
				if ((isLocalCorruption(e) || isUnrelatedHistory(e)) && data.git) {
					try {
						await this.#repair(folder, dir, data.git, data.ref);
						const toc = readTocData(
							await fs.readFile(path.join(dir, `${folder}.toc`), 'utf-8')
						);
						this.#setAddon(folder, {
							...data,
							toc,
							status: 'upToDate',
							error: 'Re-installed after a local error'
						});
						Logger.info(`Addon "${folder}" re-cloned successfully`);
						continue;
					} catch (repairError) {
						Logger.error(`Addon "${folder}" repair failed`, repairError);
					}
				}
				this.#setAddon(folder, {
					...data,
					status: 'invalid',
					error: errorDetail(e)
				});
				Logger.error(`Addon "${folder}" failed to update`, e);
			}
		}
	}

	async remove(toRemove: string[]) {
		const clientPath = Preferences.data.clientDir;
		if (!clientPath) return;
		if (this.status.state !== 'done') return;

		for (const folder of toRemove) {
			const dir = path.join(clientPath, 'Interface', 'Addons', folder);
			if (fs.existsSync(dir)) await fs.remove(dir);
			this.#setAddon(folder);
			Logger.log(`Removed addon "${folder}"`);
		}
	}

	async install(data: AddonData) {
		const clientPath = Preferences.data.clientDir;
		if (!clientPath) return;
		if (isUnsafeFolder(data.folder)) {
			Logger.error(`Refusing addon with unsafe folder name: "${data.folder}"`);
			this.#setAddon(data.folder, {
				...data,
				status: 'invalid',
				error: 'Invalid addon name'
			});
			return;
		}

		if (!data.git || !isAllowedGitUrl(data.git)) {
			Logger.error(`Refusing addon from disallowed git host: "${data.git}"`);
			this.#setAddon(data.folder, {
				...data,
				status: 'invalid',
				error: 'Addon URL is not from an allowed git host'
			});
			return;
		}

		const addonsPath = path.join(clientPath, 'Interface', 'Addons');
		const dir = path.join(addonsPath, data.folder);
		try {
			await runWorker(
				gitClone,
				{ dir, url: data.git, ref: data.ref ?? data.branch },
				{ onProgress: this.#onProgress(data.folder, data) }
			);
			await rejectIfDangerous(data.folder, dir);

			const toc = await readTocData(
				await fs.readFile(path.join(dir, `${data.folder}.toc`), 'utf-8')
			);
			this.#setAddon(data.folder, { ...data, toc, status: 'upToDate' });
			Logger.log(`Installed addon "${data.folder}"`);
		} catch (e) {
			this.#setAddon(data.folder, {
				...data,
				status: 'invalid',
				error: errorDetail(e)
			});
			Logger.error(`Addon "${data.folder}" failed to install`, e);
		}
	}

	#setAddon(folder: string, data?: AddonData) {
		const { [folder]: _, ...addons } = this.status.addons;
		this.status = {
			...this.status,
			addons: data ? { ...addons, [folder]: data } : addons
		};
	}
}

const Addons = new AddonsClass();
export default Addons;
