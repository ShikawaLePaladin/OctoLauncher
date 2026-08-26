import { z } from 'zod';

const f = {
	boolean: (defaultValue?: boolean) =>
		z.boolean().nullish().default(!!defaultValue),
	number: (defaultValue?: number, val?: (v: z.ZodNumber) => z.ZodNumber) =>
		z.preprocess(
			v =>
				v === '' || v === undefined
					? defaultValue ?? null
					: typeof v === 'string'
					? Number(v)
					: v,
			(val?.(z.number()) ?? z.number()).nullish()
		)
};

export const ConfigWtfSchema = z.object({
	vanillaFixes: f.boolean(),
	raidVisuals: f.boolean(),
	largeAddress: f.boolean(true),
	nameplateRange: f.number(41),
	alwaysAutoLoot: f.boolean(),
	fieldOfView: f.number(110),
	farClip: f.number(777),
	frillDistance: f.number(70),
	cameraDistance: f.number(50),
	soundInBackground: f.boolean(true),
	limitFpsInBackground: f.boolean(false)
});
export type ConfigWtfSchema = z.infer<typeof ConfigWtfSchema>;

export const ModStateSchema = z.object({
	enabled: z.boolean().default(false),
	installedVersion: z.string().optional(),
	installedFiles: z.array(z.string()).default([]),
	ignoreUpdates: z.boolean().default(false),
	// dxvk only: which variant to install. 'auto' follows the hardware-based
	// recommendation; the rest are an explicit player override.
	dxvkVariant: z
		.enum(['auto', 'gplasync', 'legacy', 'none'])
		.default('auto')
		.optional()
});
export type ModState = z.infer<typeof ModStateSchema>;

// what the launcher itself wrote to Data/ for one visual pack — used to
// recognize "this is our file" before ever touching it again (repointing a
// variant, or uninstalling), and to refuse if something else now occupies
// that path.
export const VisualPackStateSchema = z.object({
	variant: z.string().optional(),
	filename: z.string(),
	size: z.number(),
	// disabling parks the file as "<filename>.off" instead of deleting it —
	// these run into the multi-GB range, so toggling shouldn't mean
	// re-downloading to turn it back on
	enabled: z.boolean().default(true),
	// set once we've checked this installed file's content against the
	// catalog's sha256 (when it declares one) and either confirmed it or
	// dropped it as stale — a one-time check, not repeated on every
	// startup, since hashing a multi-GB file isn't free
	contentVerified: z.boolean().default(false)
});
export type VisualPackState = z.infer<typeof VisualPackStateSchema>;

export const HardwareInfoSchema = z.object({
	totalRamMb: z.number(),
	cpuCores: z.number(),
	cpuModel: z.string(),
	gpuModel: z.string(),
	vramMb: z.number().nullable(),
	vramSource: z.enum(['registry', 'wmi', 'none']),
	detectedAt: z.string(),
	schemaVersion: z.number()
});
export type HardwareInfo = z.infer<typeof HardwareInfoSchema>;

export const VulkanInfoSchema = z.object({
	// whether a Vulkan ICD is registered for 32-bit processes (WOW6432Node on
	// 64-bit Windows) — the client is a 32-bit executable, so this is the one
	// that actually determines whether DXVK can load at all.
	icd32Present: z.boolean(),
	icd64Present: z.boolean(),
	detectedAt: z.string(),
	schemaVersion: z.number()
});
export type VulkanInfo = z.infer<typeof VulkanInfoSchema>;

export const PreferencesSchema = z.object({
	isPortable: z.boolean().optional(),
	server: z.enum(['live', 'ptr']).default('live'),
	clientDir: z.string().optional(),
	version: z.string().optional(),
	lastPatchedLauncherVersion: z.string().optional(),
	expectedPatchedWowHash: z.string().optional(),
	minimizeToTrayOnPlay: f.boolean(true),
	cleanWdb: f.boolean(true),
	shareDownloads: f.boolean(true),
	locale: z
		.enum(['enUS', 'deDE', 'zhCN', 'esES', 'ptBR', 'ruRU'])
		.default('enUS'),
	localePatchLetter: z.string().optional(),
	localePatchLocale: z.string().optional(),
	patchedLocale: z.string().optional(),
	syncedTorrentHash: z.string().optional(),
	activeTorrentHash: z.string().optional(),
	activeClientDir: z.string().optional(),
	raidVisualsHash: z.string().optional(),
	clientPatchHash: z.string().optional(),
	vmmfWrittenIndex: z.number().int().nonnegative().optional(),
	lastWrittenResolution: z.string().optional(),
	rememberPosition: f.boolean(true),
	windowPosition: z
		.object({
			x: z.number(),
			y: z.number(),
			width: z.number(),
			height: z.number()
		})
		.nullish(),
	windowMaximized: z.boolean().optional(),
	config: ConfigWtfSchema.default({}),
	mods: z.record(ModStateSchema).default({}),
	visualPacks: z.record(VisualPackStateSchema).default({}),
	hardware: HardwareInfoSchema.optional(),
	farClipUserSet: z.boolean().optional(),
	vulkan: VulkanInfoSchema.optional(),
	dxvkPreset: z.enum(['balanced', 'lowEnd', 'performance']).default('balanced'),
	dxvkShowFps: f.boolean(),
	// player explicitly confirmed overwriting a hand-edited dxvk.conf with
	// the launcher-managed one; without this, ensureDxvkConf() never touches
	// a file that doesn't already carry its own marker
	dxvkConfTakeover: z.boolean().optional()
});
export type PreferencesSchema = z.infer<typeof PreferencesSchema>;

export const TocDataSchema = z.object({
	Interface: z.string(),
	Title: z.string(),
	Author: z.string(),
	Notes: z.string(),
	Version: z.string(),
	Dependencies: z.string().optional(),
	OptionalDeps: z.string().optional()
});

export type TocData = z.infer<typeof TocDataSchema>;

export const AddonDataSchema = z.object({
	status: z.enum([
		'available',
		'fetching',
		'unknown',
		'upToDate',
		'outOfDate',
		'downloading',
		'invalid'
	]),
	git: z.string().optional(),
	toc: TocDataSchema.optional(),
	description: z.string().optional(),
	error: z.string().optional(),
	branch: z.string().optional(),
	ref: z.string().optional(),
	folder: z.string(),
	progress: z.string().optional(),
	preview: z.string().optional()
});

export type AddonData = z.infer<typeof AddonDataSchema>;

export const NewsItemSchema = z.object({
	id: z.string(),
	title: z.string(),
	date: z.string(),
	body: z.string(),
	url: z.string().url().optional(),
	author: z.string().nullish()
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

export const NewsFeedSchema = z.object({
	items: z.array(NewsItemSchema)
});
export type NewsFeed = z.infer<typeof NewsFeedSchema>;

export const ForumAnnouncementSchema = z.object({
	id: z.string(),
	title: z.string(),
	author: z.string().nullish(),
	date: z.string(),
	url: z.string().url(),
	html: z.string()
});
export type ForumAnnouncement = z.infer<typeof ForumAnnouncementSchema>;
