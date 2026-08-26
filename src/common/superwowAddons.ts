// Sourced from the Turtle WoW wiki's "SuperWoW Addons" section
// (https://turtle-wow.fandom.com/wiki/Addons#SuperWoW_Addons), current as of
// 2026-08-26. Matched by GitHub owner/repo rather than addon name, since a
// name can be reused by an unrelated fork (the catalog's own "Decursive" is
// Zerf/Decursive — a different repo than the MarcelineVQ/Decursive the wiki
// lists as SuperWoW-enhanced — so it's deliberately left untagged rather
// than guessed).
const normalizeRepo = (git: string): string =>
	git
		.replace(/^https?:\/\/(www\.)?github\.com\//i, '')
		.replace(/\.git$/i, '')
		.replace(/\/$/, '')
		.toLowerCase();

// addons that do not function at all without the SuperWoW client mod
const REQUIRES_SUPERWOW = new Set(
	[
		'DavidBecht/AutoLock',
		'MarcelineVQ/AutoMarker',
		'pepopo978/Cursive',
		'Kirchlive/cursive-raid',
		'Flaxic-LUA/-Dragonflight3',
		'MrDoufuru/GCDisplay',
		'Profiler781/IWinEnhanced',
		'Ageous27/JankyPlates',
		'Carravan/Lateral',
		'pepopo978/MageHud',
		'MarcelineVQ/MonkeySpeed',
		'me0wg4ming/pfUI',
		'Bombg/pfUI-bettertotems',
		'Shellyoung/oCB-SuperWoW',
		'Otari98/Overhead',
		'laytya/Quartz',
		'Taeko-ar/QuickTurtleDBLookUp',
		'me0wg4ming/Rank14losSA',
		'shagu/ShaguScan',
		'refaim/SoloRaidTargetIcons',
		'jrc13245/SP_SwingTimer',
		'perks/SunderNP',
		'balakethelock/SuperAPI',
		'balakethelock/SuperAPI_Castlib',
		'jrc13245/SuperCleveRoidMacros',
		'arimbaud-x/lazyScript',
		'elboaf/SuperTotem',
		'pepopo978/SuperWowCombatLogger',
		'MarcelineVQ/SpiritLinker',
		'MarcelineVQ/Tankalyze',
		'MarcelineVQ/TankPlates',
		'MarcelineVQ/Tattler',
		'OldManAlpha/FastTOT',
		'MarcelineVQ/TrackTarget',
		'MarcelineVQ/Twister'
	].map(s => s.toLowerCase())
);

// addons that work without SuperWoW but unlock extra features with it
const ENHANCED_BY_SUPERWOW = new Set(
	[
		'MarcelineVQ/aDF',
		'MarcelineVQ/Decursive',
		'gashole/DruidManaBar',
		'refaim/Friend-O-Tron',
		'shagu/pfUI',
		'OldManAlpha/Puppeteer',
		'Otari98/Rinse',
		'shagu/ShaguDPS',
		'shagu/ShaguPlates',
		'shagu/ShaguTweaks',
		'pepopo978/SimpleActionSets',
		'MarcelineVQ/sorgis_raid_marks',
		'MarcelineVQ/SP_SwingTimer'
	].map(s => s.toLowerCase())
);

export type SuperWowTier = 'requires' | 'enhanced' | null;

export const getSuperWowTier = (
	git: string,
	name: string,
	description?: string
): SuperWowTier => {
	const repo = normalizeRepo(git);
	if (REQUIRES_SUPERWOW.has(repo)) return 'requires';
	if (ENHANCED_BY_SUPERWOW.has(repo)) return 'enhanced';

	// not on the wiki's list (could be new, or a fork it hasn't caught up
	// with yet) — a "superwow" mention right in the repo name/slug is a much
	// stronger, more literal signal than the same word merely appearing
	// somewhere in a free-text description, so the two are graded
	// differently: an explicit name match is treated as a hard requirement,
	// while a description-only mention is treated as the softer "enhanced"
	// claim so this fallback never overstates a dependency it hasn't
	// actually confirmed.
	if (/superwow/i.test(`${name} ${repo}`)) return 'requires';
	if (description && /superwow/i.test(description)) return 'enhanced';
	return null;
};
