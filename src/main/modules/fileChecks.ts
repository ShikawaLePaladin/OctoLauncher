import fs from 'node:fs';

import Logger from 'electron-log/main';

// An antivirus that intervenes after a file is already written (rather than
// blocking the write outright) can leave a truncated or replaced file behind
// instead of removing it — invisible to a plain existsSync check, but
// exactly what causes a mod's own DLL/exe to fail at load/injection time
// with a cryptic error instead of anything here ever knowing something's
// wrong. Checking for the PE magic bytes is cheap and version-agnostic (no
// hash to keep in sync with every mod update). Shared between defender.ts
// (antivirus-block detection) and mods.ts (repair should actually replace a
// corrupted-but-present file, not just a missing one).
export const isValidPe = (filePath: string): boolean => {
	let fd = -1;
	try {
		fd = fs.openSync(filePath, 'r');
		const buf = Buffer.alloc(2);
		return fs.readSync(fd, buf, 0, 2, 0) === 2 && buf[0] === 0x4d && buf[1] === 0x5a;
	} catch (e) {
		Logger.warn(`isValidPe: could not read ${filePath}`, e);
		return false;
	} finally {
		if (fd !== -1) fs.closeSync(fd);
	}
};
