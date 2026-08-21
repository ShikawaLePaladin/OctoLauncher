import { z } from 'zod';

export const ModIdSchema = z.enum([
	'dxvk',
	'nampower',
	'multiMonitorFix',
	'superWow',
	'transmogFix',
	'unitXp',
	'vanillaFixes',
	'vanillaHelpers'
]);
export type ModId = z.infer<typeof ModIdSchema>;

export type ModSource =
	| {
			kind: 'directFile';
			url: string;
			parseLatest?: 'githubRelease' | 'gitlabRelease' | 'codebergRelease';
			apiUrl?: string;
			pinnedTag?: string;
			assetName: string;
			sha256?: string;
	  }
	| {
			kind: 'archive';
			url: string;
			apiUrl?: string;
			parseLatest?: 'githubRelease' | 'gitlabRelease' | 'codebergRelease';
			pinnedTag?: string;
			format: 'zip' | 'tar.gz';
			extractMap: Record<string, string>;
			sha256?: string;
	  }
	| { kind: 'managed' };

export type ModEntry = {
	id: ModId;
	name: string;
	version: string;
	description: string;
	recommended?: boolean;
	requires?: ModId[];
	repoUrl: string;
	source: ModSource;
	registerInDllsTxt?: string;
	// hidden from the Mods tab, never enabled on fresh installs; existing installs keep it
	disabled?: boolean;
};

export const MODS: ModEntry[] = [
	{
		id: 'dxvk',
		name: 'dxvk',
		version: 'v2.7.1-1',
		description: 'Enables Vulkan based rendering mode for better performance.',
		recommended: true,
		repoUrl: 'https://gitlab.com/Ph42oN/dxvk-gplasync',
		source: {
			kind: 'archive',
			url: 'https://gitlab.com/Ph42oN/dxvk-gplasync/-/raw/main/releases/dxvk-gplasync-v2.7.1-1.tar.gz?ref_type=heads',
			pinnedTag: 'v2.7.1-1',
			format: 'tar.gz',
			extractMap: {
				'dxvk-gplasync-v2.7.1-1/x32/d3d9.dll': 'd3d9.dll'
			}
		}
	},
	{
		id: 'nampower',
		name: 'nampower',
		version: 'v4.6.2',
		description:
			'A client modification that minimizes your input lag if you have higher latency.',
		repoUrl: 'https://github.com/Emyrk/nampower',
		requires: ['vanillaFixes'],
		source: {
			kind: 'directFile',
			url: 'https://github.com/Emyrk/nampower/releases/download/v4.6.2/nampower.dll',
			pinnedTag: 'v4.6.2',
			assetName: 'nampower.dll'
		},
		registerInDllsTxt: 'nampower.dll'
	},
	{
		id: 'multiMonitorFix',
		name: 'no1600x1200',
		version: '0.2',
		description: 'Fix for larger resolutions or multi monitor setups.',
		repoUrl: 'https://github.com/Mates1500/VanillaMultiMonitorFix',
		requires: ['vanillaFixes'],
		source: {
			kind: 'archive',
			url: 'https://github.com/Mates1500/VanillaMultiMonitorFix/releases/download/0.2/release.zip',
			apiUrl:
				'https://api.github.com/repos/Mates1500/VanillaMultiMonitorFix/releases/latest',
			parseLatest: 'githubRelease',
			pinnedTag: '0.2',
			format: 'zip',
			extractMap: {
				'VanillaMultiMonitorFix.dll': 'VanillaMultiMonitorFix.dll'
			}
		},
		registerInDllsTxt: 'VanillaMultiMonitorFix.dll'
	},
	{
		id: 'superWow',
		name: 'SuperWoW',
		version: '2.2',
		description:
			'Extends the client Lua API with unit GUIDs and other data many addons rely on.',
		repoUrl: 'https://github.com/balakethelock/SuperWoW',
		requires: ['vanillaFixes'],
		source: {
			kind: 'archive',
			url: 'https://github.com/balakethelock/SuperWoW/releases/download/Release/SuperWoW.release.2.2.zip',
			apiUrl:
				'https://api.github.com/repos/balakethelock/SuperWoW/releases/latest',
			parseLatest: 'githubRelease',
			pinnedTag: '2.2',
			format: 'zip',
			extractMap: {
				'SuperWoWhook.dll': 'SuperWoWhook.dll'
			}
		},
		registerInDllsTxt: 'SuperWoWhook.dll',
		// disabled 2026-08-08 pending distribution permission; delete this line to re-enable
		disabled: true
	},
	{
		id: 'transmogFix',
		name: 'transmogFix',
		version: 'v0.7.0',
		description:
			"A client-side fix that eliminates frame drops caused by the server's transmogrification durability workaround.",
		repoUrl: 'https://codeberg.org/MarcelineVQ/WeirdUtils',
		requires: ['vanillaFixes'],
		source: {
			kind: 'directFile',
			url: 'https://codeberg.org/MarcelineVQ/WeirdUtils/releases/download/v0.7.0/transmogfix.dll',
			pinnedTag: 'v0.7.0',
			assetName: 'transmogfix.dll'
		},
		registerInDllsTxt: 'transmogfix.dll'
	},
	{
		id: 'unitXp',
		name: 'unitXp',
		version: 'v89',
		description: 'An attempt to make Vanilla 1.12 modern.',
		repoUrl: 'https://codeberg.org/konaka/UnitXP_SP3',
		requires: ['vanillaFixes'],
		source: {
			kind: 'archive',
			url: 'https://codeberg.org/konaka/UnitXP_SP3/releases/download/v89/UnitXP_SP3%20v89.zip',
			pinnedTag: 'v89',
			format: 'zip',
			extractMap: {
				'UnitXP_SP3.dll': 'UnitXP_SP3.dll'
			}
		},
		registerInDllsTxt: 'UnitXP_SP3.dll'
	},
	{
		id: 'vanillaFixes',
		name: 'vanillaFixes',
		version: 'v1.5.3',
		description:
			'A client modification that eliminates stutter and animation lag.',
		recommended: true,
		repoUrl: 'https://github.com/hannesmann/vanillafixes',
		source: {
			kind: 'archive',
			url: 'https://github.com/hannesmann/vanillafixes/releases/download/v1.5.3/vanillafixes-1.5.3.zip',
			apiUrl:
				'https://api.github.com/repos/hannesmann/vanillafixes/releases/latest',
			parseLatest: 'githubRelease',
			pinnedTag: 'v1.5.3',
			format: 'zip',
			extractMap: {
				'VfPatcher.dll': 'VfPatcher.dll',
				'VanillaFixes.exe': 'VanillaFixes.exe'
			}
		}
	},
	{
		id: 'vanillaHelpers',
		name: 'vanillaHelpers',
		version: 'v1.1.2',
		description:
			'Utility library that might be required by other patches and addons.',
		repoUrl: 'https://github.com/isfir/VanillaHelpers',
		requires: ['vanillaFixes'],
		source: {
			kind: 'directFile',
			url: 'https://github.com/isfir/VanillaHelpers/releases/download/v1.1.2/VanillaHelpers.dll',
			apiUrl:
				'https://api.github.com/repos/isfir/VanillaHelpers/releases/latest',
			parseLatest: 'githubRelease',
			pinnedTag: 'v1.1.2',
			assetName: 'VanillaHelpers.dll'
		},
		registerInDllsTxt: 'VanillaHelpers.dll'
	}
];

export const getMod = (id: ModId): ModEntry | undefined =>
	MODS.find(m => m.id === id);

// dxvk ships two hardware-gated builds. 'auto' (the default) picks between
// them from detected Vulkan support + GPU generation; the player can also
// force one explicitly, or 'none' to skip dxvk regardless of the recommendation.
export type DxvkVariantId = 'gplasync' | 'legacy';

export type DxvkVariant = {
	label: string;
	version: string;
	note: string;
	source: Extract<ModSource, { kind: 'archive' }>;
};

export const DXVK_VARIANTS: Record<DxvkVariantId, DxvkVariant> = {
	gplasync: {
		label: 'DXVK (gplasync)',
		version: 'v2.7.1-1',
		note: 'For recent GPUs with a Vulkan 1.3 driver.',
		source: {
			kind: 'archive',
			url: 'https://gitlab.com/Ph42oN/dxvk-gplasync/-/raw/main/releases/dxvk-gplasync-v2.7.1-1.tar.gz?ref_type=heads',
			pinnedTag: 'v2.7.1-1',
			format: 'tar.gz',
			sha256:
				'590050b88be7b156cf641abe762e1ad47ebbe828f7f0edb2970aa4716ee3af6d',
			extractMap: {
				'dxvk-gplasync-v2.7.1-1/x32/d3d9.dll': 'd3d9.dll'
			}
		}
	},
	legacy: {
		label: 'DXVK (1.10.3)',
		version: 'v1.10.3',
		note: 'For older GPUs whose driver only supports Vulkan 1.1/1.2.',
		source: {
			kind: 'archive',
			url: 'https://github.com/doitsujin/dxvk/releases/download/v1.10.3/dxvk-1.10.3.tar.gz',
			pinnedTag: 'v1.10.3',
			format: 'tar.gz',
			sha256:
				'8d1a3c912761b450c879f98478ae64f6f6639e40ce6848170a0f6b8596fd53c6',
			extractMap: {
				'dxvk-1.10.3/x32/d3d9.dll': 'd3d9.dll'
			}
		}
	}
};

// sha256 of the extracted x32/d3d9.dll itself (not the tarball) for each
// variant, used to recognize a launcher-installed dxvk file on disk so it can
// be parked/restored instead of mistaken for a foreign file.
export const DXVK_DLL_SHA256: Record<DxvkVariantId, string> = {
	gplasync:
		'a2cd6841e102f37189527c118ec416fa5071ac4d3120762973d9a0c6c5fd067e',
	legacy: 'b6cfa2cd62af73b80d461085d126004b0e22dd3944c9246c58e3a68e747b56b6'
};

// fallback for profiles with no stored state: enabled, so legacy installs
// keep their mods; fresh installs seed explicit off rows instead (do NOT
// flip this list to change defaults, it strips mods from legacy profiles)
export const DEFAULT_ENABLED_MODS: ModId[] = MODS.filter(m => !m.disabled).map(
	m => m.id
);
