// The server's addon catalog carries no category field, and ~1 in 3 entries
// have no description either — so this infers a category from name +
// description keywords. It's a heuristic for filtering, not authoritative
// data; an addon that matches nothing lands in 'misc' rather than being
// mis-sorted into a category it doesn't fit.
export const ADDON_CATEGORIES = [
	'raid',
	'ui',
	'quests',
	'inventory',
	'combat',
	'class',
	'hardcore',
	'social',
	'misc'
] as const;
export type AddonCategory = (typeof ADDON_CATEGORIES)[number];

// checked in order — first match wins, so put the more specific categories
// ahead of broad ones like 'ui'. "quest" and a few others are deliberately
// unbounded (no \b) so they still match inside a compound addon name like
// "pfQuest" or "SimpleActionSets", where a word-boundary check would only
// ever match against the (often unhelpful, sometimes empty) description.
const RULES: [AddonCategory, RegExp][] = [
	[
		'hardcore',
		/\bhardcore\b|\bhc\b|death.?log|unitscan/i
	],
	[
		'raid',
		/\braid\b|\bboss(es)?\b|\bwigs\b|encounter|threat|decurs|dispel|\brinse\b|masterloot|soft.?reserve|consolidated buff|tactic|world.?buff/i
	],
	[
		'class',
		/warlock|shaman|hunter|paladin|totem|soul shard|spell.?queue|nampower|unitxp|superwow|superapi/i
	],
	[
		'inventory',
		/\bbag\b|inventory|item set|outfit|auction|\bloot\b|vendor|sell value|transmog|cooking|consumable|\bfish/i
	],
	[
		'quests',
		/quest|\bmap\b|zone level|travel|leveling|\brested\b|\bxp\b|\bflight\b/i
	],
	[
		'combat',
		/damage meter|\bdps\b|\bproc\b|combat|castbar|nameplate|plates\b|low health|heartbeat|power.?auras?|auras?\b|swing timer/i
	],
	[
		'social',
		/\bchat\b|whisper|\bguild\b|\bfriend|\bmail\b|calendar|roleplay|\brp\b|bulletin|looking for more|\blfm\b|lfg/i
	],
	[
		'ui',
		/\bui\b|interface|\bhud\b|action.?(bar|set)|spellbook|\bskin|flyout|resource bar|character (stat|panel)/i
	]
];

// A few well-known addons whose catalog description is empty or too generic
// to categorize by keyword at all (e.g. "additions by balake/relar/pepopo").
// Matched by exact addon name — deliberately small and hand-picked rather
// than a broader name-based heuristic, since a wrong guess here is worse
// than just leaving an addon in 'misc'.
const NAME_OVERRIDES: Record<string, AddonCategory> = {
	bigwigs: 'raid',
	wim: 'social',
	turtlerp: 'social',
	guda: 'combat',
	gudaplates: 'combat'
};

export const categorizeAddon = (name: string, description?: string): AddonCategory => {
	const override = NAME_OVERRIDES[name.toLowerCase()];
	if (override) return override;
	const text = `${name} ${description ?? ''}`;
	for (const [category, pattern] of RULES) if (pattern.test(text)) return category;
	return 'misc';
};
