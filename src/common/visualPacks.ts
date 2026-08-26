// Project Reforged's modular HD visual overhaul for vanilla 1.12
// (https://projectreforged.github.io/vanilla/). Built for Turtle WoW, not
// OctoWoW — Patch-A, Patch-I and Patch-M explicitly reference Turtle's own
// custom races/client/zones, so they can visually mismatch anything
// OctoWoW added on top of vanilla that Turtle doesn't have. Everything else
// is generic vanilla-asset replacement and carries no such risk.
//
// Each patch ships as a single self-contained .mpq — the safest possible
// format here: installing is "write one file into Data/", uninstalling is
// "delete that exact file", with nothing else ever touched. Sizes are
// multi-hundred-MB to multi-GB, so there's no sha256 pinned per file (that
// would mean downloading 10+ GB just to compute catalog hashes); the exact
// byte size from the CDN is used instead, both to catch a truncated
// download and to recognize "this is a file we installed" before ever
// overwriting or deleting anything at that path.

import { z } from 'zod';

export const VisualPackIdSchema = z.enum([
	'A',
	'B',
	'C',
	'D',
	'E',
	'G',
	'I',
	'L',
	'M',
	'N',
	'P',
	'S',
	'T',
	'U'
]);
export type VisualPackId = z.infer<typeof VisualPackIdSchema>;

export type VisualPackFile = {
	url: string;
	size: number;
	// exact Data/<filename> this installs as. MUST be "patch-<single char>.mpq"
	// — confirmed by direct testing that the client's patch loader only scans
	// for that exact shape (matching official patch-O.mpq); a longer name
	// like "patch-reforged-A.mpq" is silently never opened, so the pack
	// downloads fine but has zero effect in game. This does mean a letter
	// could collide with a future official OctoWoW patch: install() in
	// visualPacks.ts refuses to write over a same-named file it doesn't
	// recognize, and if OctoWoW ever ships official content under one of
	// these letters the game-sync path in updater.ts is left free to
	// overwrite it (server compatibility wins over a cosmetic pack) —
	// refresh() notices the size no longer matches and drops the pack's
	// stale "installed" record on its own.
	filename: string;
	// optional: a content hash used to catch "same size, different bytes"
	// cases size-matching alone can't (e.g. a fixed re-upload replacing a
	// broken file at the same URL) — checked once per install, not on
	// every startup, since hashing these files isn't free. Omitted by
	// default for the same reason sizes are used instead of hashes for
	// download verification: computing one means reading the whole
	// multi-GB file.
	sha256?: string;
};

export type VisualPackVariant = {
	id: string;
	label: string;
	note: string;
	file: VisualPackFile;
};

export type VisualPackEntry = {
	id: VisualPackId;
	patchLabel: string;
	name: string;
	icon: string;
	description: string;
	version: string;
	serverSpecific?: boolean;
	// set only once a pack has been directly reproduced to crash the client
	// (not a compatibility guess) — see the crashesGame comment on Patch-C
	// below for how this one was isolated.
	crashesGame?: boolean;
	requires?: VisualPackId[];
	// installed/removed as one unit — the source explicitly says these
	// don't work correctly installed only partially
	bundleGroup?: 'BDE';
} & ({ file: VisualPackFile; variants?: never } | { file?: never; variants: VisualPackVariant[] });

const CDN = 'https://pub-0f05631d243e4046993fc02ca7be9542.r2.dev/patches';

export const VISUAL_PACKS: VisualPackEntry[] = [
	{
		id: 'A',
		patchLabel: 'Patch-A',
		name: 'Player Characters & NPCs',
		icon: '🧙',
		description:
			"Character and NPC visuals, including Turtle WoW's custom races (Goblin, High Elf, Naga and others). Foundation for the Female, HD, and Ultra HD packs below.",
		version: 'v5.5.1',
		serverSpecific: true,
		file: { url: `${CDN}/patch-A.mpq`, size: 1748152913, filename: 'patch-A.mpq' }
	},
	{
		id: 'B',
		patchLabel: 'Patch-B',
		name: 'Buildings',
		icon: '🏰',
		description: 'Part of the Environment & World set — install together with Doodads and Environment, or not at all.',
		version: 'v5.0.0',
		bundleGroup: 'BDE',
		file: { url: `${CDN}/patch-B.mpq`, size: 1608961816, filename: 'patch-B.mpq' }
	},
	{
		id: 'C',
		patchLabel: 'Patch-C',
		name: 'Creatures',
		icon: '🐉',
		description: 'Creatures and related assets for the classic client.',
		version: 'v5.5.1',
		// this pack used to crash the client reliably within 1-2 minutes,
		// alone or in any combination. Root cause: it bundles its own
		// DBFilesClient\Creature{DisplayInfo,ModelData,SoundData}.dbc,
		// replacing OctoWoW's own — those DBCs are indexed by ID, and a
		// lookup for any custom creature OctoWoW added past what this
		// pack's tables cover reads a garbage/out-of-bounds row, which is
		// exactly the null/near-null access violation observed. Fixed by
		// deleting those 3 files' hash-table entries from the .mpq (the
		// standard MPQ file-delete convention: blockTableIndex set to
		// 0xFFFFFFFE) so the client falls through to OctoWoW's own DBCs —
		// every other file in the pack (models/textures/sounds) is
		// untouched, so the HD visuals are unaffected. Re-verified stable
		// for 3+ minutes standalone and in combination with the full pack
		// set after the fix. sha256 lets refresh() catch anyone who
		// downloaded the broken file before this fix shipped (same byte
		// size, so the existing size check alone can't tell them apart).
		// Hosted on a separate R2 bucket from the main CDN (not ${CDN}) —
		// the fixed file lives here until it's folded into the main patch
		// host; filename below is unrelated to this URL, it's just the
		// name this still installs as on disk (the client only recognizes
		// patch-C.mpq).
		file: {
			url: 'https://pub-0861034833294a50ba7dd2810855e862.r2.dev/patches/patch-C-v2.mpq',
			size: 2083036611,
			filename: 'patch-C.mpq',
			sha256: 'da0a667cf93f0c36860dbd8567fb8e1dc22a1b7f77fc6257a195464437e09e2d'
		}
	},
	{
		id: 'D',
		patchLabel: 'Patch-D',
		name: 'Doodads',
		icon: '🌿',
		description: 'World doodads and textures — part of the Environment & World set.',
		version: 'v5.5.2',
		bundleGroup: 'BDE',
		file: { url: `${CDN}/patch-D.mpq`, size: 1648472586, filename: 'patch-D.mpq' }
	},
	{
		id: 'E',
		patchLabel: 'Patch-E',
		name: 'Environment',
		icon: '🌄',
		description: 'Environment textures and world visuals, including extended draw distance — part of the Environment & World set.',
		version: 'v5.4.1',
		bundleGroup: 'BDE',
		file: { url: `${CDN}/patch-E.mpq`, size: 719685533, filename: 'patch-E.mpq' }
	},
	{
		id: 'G',
		patchLabel: 'Patch-G',
		name: 'Gear & Weapons',
		icon: '⚔️',
		description: 'Gear and weapon visuals used by multiple other packs below.',
		version: 'v5.4.1',
		file: { url: `${CDN}/patch-G.mpq`, size: 774538222, filename: 'patch-G.mpq' }
	},
	{
		id: 'I',
		patchLabel: 'Patch-I',
		name: 'Interface',
		icon: '🧭',
		description: 'Interface visuals and selection-circle texture support, tuned for the Turtle WoW client specifically.',
		version: 'v5.3.0',
		serverSpecific: true,
		file: { url: `${CDN}/patch-I.mpq`, size: 162091469, filename: 'patch-I.mpq' }
	},
	{
		id: 'L',
		patchLabel: 'Patch-L',
		name: 'Female Body Model',
		icon: '💃',
		description: 'Optional female body model enhancement. Pick one variant.',
		version: 'v5.5.0',
		requires: ['A'],
		variants: [
			{
				id: 'regular',
				label: 'Regular',
				note: 'by Watchers3D',
				file: { url: `${CDN}/patch-L.mpq`, size: 37330631, filename: 'patch-L.mpq' }
			},
			{
				id: 'thicc',
				label: 'Less Thicc',
				note: 'by Deezhugs',
				file: {
					url: `${CDN}/extras/patch-L.mpq`,
					size: 53272447,
					filename: 'patch-L.mpq'
				}
			}
		]
	},
	{
		id: 'M',
		patchLabel: 'Patch-M',
		name: 'Maps & Loading Screens',
		icon: '🗺️',
		description: "Enhanced maps and loading screens, including Turtle WoW's custom zones and continents.",
		version: 'v5.4.2',
		serverSpecific: true,
		file: { url: `${CDN}/patch-M.mpq`, size: 438564005, filename: 'patch-M.mpq' }
	},
	{
		id: 'N',
		patchLabel: 'Patch-N',
		name: 'Darker Nights',
		icon: '🌑',
		description: 'A more atmospheric night cycle.',
		version: 'v5.0.0',
		file: { url: `${CDN}/patch-N.mpq`, size: 201362, filename: 'patch-N.mpq' }
	},
	{
		id: 'P',
		patchLabel: 'Patch-P',
		name: 'Spell Particle Effects',
		icon: '🪄',
		description: 'Spell visuals and effect enhancements.',
		version: 'v5.5.0',
		file: { url: `${CDN}/patch-P.mpq`, size: 7272085, filename: 'patch-P.mpq' }
	},
	{
		id: 'S',
		patchLabel: 'Patch-S',
		name: 'Sounds & Music',
		icon: '🎵',
		description: 'Sound and music enhancements.',
		version: 'v5.3.4',
		file: { url: `${CDN}/patch-S.mpq`, size: 262721653, filename: 'patch-S.mpq' }
	},
	{
		id: 'T',
		patchLabel: 'Patch-T',
		name: 'HD Character & Gear Textures',
		icon: '✨',
		description:
			'High-definition textures for characters and gear. Use Standard on its own, or Ultra Base if you also plan to install Ultra HD below.',
		version: 'v5.5.0',
		requires: ['A', 'G'],
		variants: [
			{
				id: 'standard',
				label: 'Standard',
				note: 'Balanced quality — use if not installing Ultra HD',
				file: {
					url: `${CDN}/extras/patch-T.mpq`,
					size: 541957195,
					filename: 'patch-T.mpq'
				}
			},
			{
				id: 'ultraBase',
				label: 'Ultra Base',
				note: 'Required if installing Ultra HD',
				file: { url: `${CDN}/patch-T.mpq`, size: 499342621, filename: 'patch-T.mpq' }
			}
		]
	},
	{
		id: 'U',
		patchLabel: 'Patch-U',
		name: 'Ultra HD Character & Gear Textures',
		icon: '💎',
		description:
			'Maximum-detail textures for characters and gear, built on top of the HD pack (Ultra Base variant). Very large download.',
		version: 'v5.5.0',
		requires: ['A', 'G', 'T'],
		file: { url: `${CDN}/patch-U.mpq`, size: 1662548731, filename: 'patch-U.mpq' }
	}
];

export const getVisualPack = (id: VisualPackId): VisualPackEntry | undefined =>
	VISUAL_PACKS.find(p => p.id === id);
