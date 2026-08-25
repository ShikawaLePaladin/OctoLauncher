import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

import fs from 'fs-extra';
import fetch from 'node-fetch';
import Logger from 'electron-log/main';

import {
	VISUAL_PACKS,
	getVisualPack,
	type VisualPackId,
	type VisualPackFile
} from '~common/visualPacks';

import Preferences from './preferences';
import Observable from './observable';

export type VisualPackRowStatus = {
	id: VisualPackId;
	installed: boolean;
	enabled: boolean;
	installedVariant?: string;
	progress?: number; // 0-1, present only while downloading
	error?: string;
};

// disabling parks the file under this suffix instead of deleting it —
// re-enabling is a rename, not a re-download.
const parkedSuffix = (filename: string) => `${filename}.off`;

export type VisualPacksStatus = {
	rows: VisualPackRowStatus[];
};

// streams straight to disk — these files run into the multi-GB range, so
// buffering a full response body in memory (the pattern the small DLL mods
// use) is not an option here.
const downloadToFile = async (
	url: string,
	destPath: string,
	expectedSize: number,
	onProgress?: (fraction: number) => void
): Promise<void> => {
	const res = await fetch(url);
	if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} fetching ${url}`);

	await fs.ensureDir(path.dirname(destPath));
	const tmpPath = `${destPath}.tmp`;
	let received = 0;
	let lastReported = 0;

	// a Transform in the pipeline (rather than a side `.on('data', ...)`
	// listener) participates in the chain's own backpressure — the source
	// only gets pulled as fast as the destination can actually write, which
	// matters at these file sizes (a plain listener would let the network
	// read ahead of a slow disk with nothing to throttle it).
	const progressTracker = new Transform({
		transform(chunk: Buffer, _enc, callback) {
			received += chunk.length;
			if (onProgress && received - lastReported > expectedSize / 100) {
				lastReported = received;
				onProgress(Math.min(1, received / expectedSize));
			}
			callback(null, chunk);
		}
	});

	try {
		await pipeline(res.body, progressTracker, fs.createWriteStream(tmpPath));
	} catch (e) {
		await fs.remove(tmpPath).catch(() => undefined);
		throw e;
	}

	const stat = await fs.stat(tmpPath);
	if (stat.size !== expectedSize) {
		await fs.remove(tmpPath).catch(() => undefined);
		throw new Error(
			`Downloaded size (${stat.size}) doesn't match the expected ${expectedSize} bytes — the download may have been interrupted or the CDN file changed.`
		);
	}

	await fs.remove(destPath).catch(() => undefined);
	await fs.move(tmpPath, destPath);
	onProgress?.(1);
};

// true if whatever currently sits at this path is exactly what we last
// recorded installing there — the only case it's ever safe to overwrite or
// delete. Anything else (nothing there, a different size, no record of
// having installed it) means "not ours", so callers must refuse rather than
// touch it — it could be an official OctoWoW content patch that happens to
// use the same Data/ filename.
const isOurFile = async (
	filePath: string,
	recordedSize: number | undefined
): Promise<boolean> => {
	if (recordedSize === undefined) return false;
	const stat = await fs.stat(filePath).catch(() => null);
	return !!stat && stat.size === recordedSize;
};

class VisualPacksClass extends Observable<VisualPacksStatus> {
	protected _value: VisualPacksStatus = { rows: [] };

	get status(): VisualPacksStatus {
		return this._value;
	}
	private set status(v: VisualPacksStatus) {
		this._value = v;
		this._notifyObservers(v);
	}

	#patchRow(id: VisualPackId, patch: Partial<VisualPackRowStatus>) {
		const rows = this._value.rows.some(r => r.id === id)
			? this._value.rows.map(r => (r.id === id ? { ...r, ...patch } : r))
			: [...this._value.rows, { id, installed: false, enabled: false, ...patch }];
		this.status = { rows };
	}

	// a .tmp can only be left behind by a download that never finished
	// downloadToFile()'s own cleanup (the whole app closing mid-stream,
	// rather than the fetch/write itself failing) — nothing is ever
	// mid-download at the moment refresh() runs, right after startup, so
	// any .tmp found here is safe to remove outright. Matched against the
	// current catalog's own filenames rather than a loose pattern, so this
	// can never sweep up something unrelated.
	async #cleanupOrphanedDownloads() {
		const dataDir = this.#dataDir();
		if (!dataDir) return;
		const ours = new Set(
			VISUAL_PACKS.flatMap(p =>
				(p.file ? [p.file] : p.variants?.map(v => v.file) ?? []).map(f => `${f.filename}.tmp`)
			)
		);
		const names = await fs.readdir(dataDir).catch(() => []);
		await Promise.all(
			names
				.filter(n => ours.has(n))
				.map(n =>
					fs
						.remove(path.join(dataDir, n))
						.then(() => Logger.info(`Removed orphaned visual pack download: ${n}`))
						.catch(e => Logger.warn(`Could not remove orphaned download ${n}`, e))
				)
		);
	}

	// Early builds installed packs as "patch-reforged-<letter>.mpq" to avoid
	// any chance of colliding with an official OctoWoW patch filename. That
	// turned out to make them invisible to the client's own patch loader —
	// confirmed by direct testing, it only opens single-character suffixes
	// (patch-O.mpq is the same scheme OctoWoW's own content uses) — so every
	// pack installed under the old name was silently inert in game despite
	// reporting a successful install. This renames already-downloaded files
	// to the working name in place, so nobody has to re-download multiple GB
	// on top of the naming fix.
	async #migrateLegacyFilenames() {
		const dataDir = this.#dataDir();
		if (!dataDir) return;
		for (const pack of VISUAL_PACKS) {
			const state = Preferences.data.visualPacks?.[pack.id];
			if (!state) continue;
			const expected: VisualPackFile | undefined =
				pack.file ?? pack.variants?.find(v => v.id === state.variant)?.file;
			if (!expected || state.filename === expected.filename) continue;

			const oldLive = path.join(dataDir, state.filename);
			const oldParked = path.join(dataDir, parkedSuffix(state.filename));
			const fromPath = (await isOurFile(oldLive, state.size))
				? oldLive
				: (await isOurFile(oldParked, state.size))
				? oldParked
				: null;
			// nothing of ours left under the old name — the normal
			// stale-record cleanup further down handles this case
			if (!fromPath) continue;

			const toPath = path.join(
				dataDir,
				fromPath === oldLive ? expected.filename : parkedSuffix(expected.filename)
			);
			if ((await fs.pathExists(toPath)) && !(await isOurFile(toPath, state.size))) {
				Logger.warn(
					`Visual pack "${pack.id}": can't migrate to ${expected.filename}, an unrecognized file already exists there.`
				);
				continue;
			}
			await fs.move(fromPath, toPath, { overwrite: true });
			Preferences.data = {
				visualPacks: {
					...Preferences.data.visualPacks,
					[pack.id]: { ...state, filename: expected.filename }
				}
			};
			Logger.info(`Visual pack "${pack.id}": migrated ${state.filename} -> ${expected.filename}`);
		}
	}

	async refresh() {
		await this.#migrateLegacyFilenames();
		await this.#cleanupOrphanedDownloads();
		const dataDir = this.#dataDir();
		const rows: VisualPackRowStatus[] = [];
		const stale: VisualPackId[] = [];
		const driftedEnabled: Record<string, boolean> = {};

		for (const pack of VISUAL_PACKS) {
			const state = Preferences.data.visualPacks?.[pack.id];
			let installed = false;
			let enabled = false;
			if (state && dataDir) {
				const livePath = path.join(dataDir, state.filename);
				const parkedPath = path.join(dataDir, parkedSuffix(state.filename));
				if (await isOurFile(livePath, state.size)) {
					installed = true;
					enabled = true;
				} else if (await isOurFile(parkedPath, state.size)) {
					installed = true;
					enabled = false;
				}
			}
			rows.push({
				id: pack.id,
				installed,
				enabled,
				installedVariant: installed ? state?.variant : undefined
			});
			if (state && !installed) stale.push(pack.id);
			// the recorded enabled flag disagrees with which of the two
			// paths actually matches on disk (e.g. renamed outside the
			// launcher) — reconcile the record to reality
			else if (state && state.enabled !== enabled) driftedEnabled[pack.id] = enabled;
		}

		if (stale.length || Object.keys(driftedEnabled).length) {
			const visualPacks = { ...Preferences.data.visualPacks };
			for (const id of stale) delete visualPacks[id];
			for (const [id, enabled] of Object.entries(driftedEnabled)) {
				const existing = visualPacks[id as VisualPackId];
				if (existing) visualPacks[id as VisualPackId] = { ...existing, enabled };
			}
			Preferences.data = { visualPacks };
		}
		this.status = { rows };
	}

	#dataDir(): string | null {
		const clientDir = Preferences.data.clientDir;
		return clientDir ? path.join(clientDir, 'Data') : null;
	}

	async install(id: VisualPackId, variantId?: string) {
		const pack = getVisualPack(id);
		const dataDir = this.#dataDir();
		if (!pack || !dataDir) return;

		const file: VisualPackFile | undefined = pack.file ?? pack.variants?.find(v => v.id === variantId)?.file;
		if (!file) {
			Logger.error(`Visual pack "${id}": no matching file for variant "${variantId}"`);
			return;
		}

		const destPath = path.join(dataDir, file.filename);
		const existingState = Preferences.data.visualPacks?.[id];

		// something is already at this path and it isn't a file this feature
		// installed — refuse rather than risk clobbering an official OctoWoW
		// content patch that happens to share the name.
		if (
			(await fs.pathExists(destPath)) &&
			!(await isOurFile(destPath, existingState?.size))
		) {
			const msg = `Refusing to overwrite ${file.filename}: an unrecognized file already exists there.`;
			Logger.error(`Visual pack "${id}": ${msg}`);
			this.#patchRow(id, { error: msg });
			return;
		}

		this.#patchRow(id, { progress: 0, error: undefined });
		try {
			await downloadToFile(file.url, destPath, file.size, fraction =>
				this.#patchRow(id, { progress: fraction })
			);
			Preferences.data = {
				visualPacks: {
					...Preferences.data.visualPacks,
					[id]: { variant: variantId, filename: file.filename, size: file.size, enabled: true }
				}
			};
			this.#patchRow(id, {
				installed: true,
				enabled: true,
				installedVariant: variantId,
				progress: undefined
			});
			Logger.info(`Visual pack "${id}" installed (${file.filename}, ${file.size} bytes)`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			Logger.error(`Visual pack "${id}" install failed`, e);
			this.#patchRow(id, { progress: undefined, error: msg });
		}
	}

	// disable/re-enable an already-installed pack without touching the
	// download — a rename either way, so toggling a multi-GB pack off and
	// back on doesn't mean re-fetching it.
	async setEnabled(id: VisualPackId, wantEnabled: boolean) {
		const dataDir = this.#dataDir();
		const state = Preferences.data.visualPacks?.[id];
		if (!dataDir || !state || state.enabled === wantEnabled) return;

		const livePath = path.join(dataDir, state.filename);
		const parkedPath = path.join(dataDir, parkedSuffix(state.filename));
		const [from, to] = wantEnabled ? [parkedPath, livePath] : [livePath, parkedPath];

		if (!(await isOurFile(from, state.size))) {
			const msg = `Can't ${wantEnabled ? 'enable' : 'disable'} ${state.filename}: it no longer matches what was installed.`;
			Logger.warn(`Visual pack "${id}": ${msg}`);
			this.#patchRow(id, { error: msg });
			return;
		}
		if ((await fs.pathExists(to)) && !(await isOurFile(to, state.size))) {
			const msg = `Refusing to overwrite an unrecognized file at ${path.basename(to)}.`;
			Logger.error(`Visual pack "${id}": ${msg}`);
			this.#patchRow(id, { error: msg });
			return;
		}

		await fs.move(from, to, { overwrite: true });
		Preferences.data = {
			visualPacks: { ...Preferences.data.visualPacks, [id]: { ...state, enabled: wantEnabled } }
		};
		this.#patchRow(id, { enabled: wantEnabled, error: undefined });
		Logger.info(`Visual pack "${id}" ${wantEnabled ? 'enabled' : 'disabled'}`);
	}

	async uninstall(id: VisualPackId) {
		const dataDir = this.#dataDir();
		const state = Preferences.data.visualPacks?.[id];
		if (!dataDir || !state) return;

		const livePath = path.join(dataDir, state.filename);
		const parkedPath = path.join(dataDir, parkedSuffix(state.filename));
		const target = (await isOurFile(livePath, state.size))
			? livePath
			: (await isOurFile(parkedPath, state.size))
			? parkedPath
			: null;

		if (target) {
			await fs.remove(target).catch(e => {
				Logger.warn(`Visual pack "${id}": failed to remove ${path.basename(target)}`, e);
			});
		} else {
			// already gone, or changed since — either way there's nothing of
			// ours left to remove, so just drop the stale record
			Logger.warn(
				`Visual pack "${id}": ${state.filename} no longer matches what we installed; clearing the record without touching the file`
			);
		}

		const { [id]: _removed, ...rest } = Preferences.data.visualPacks ?? {};
		Preferences.data = { visualPacks: rest };
		this.#patchRow(id, {
			installed: false,
			enabled: false,
			installedVariant: undefined,
			error: undefined
		});
		Logger.info(`Visual pack "${id}" uninstalled`);
	}
}

const VisualPacks = new VisualPacksClass();
export default VisualPacks;
