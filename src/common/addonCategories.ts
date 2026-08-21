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
// ahead of broad ones like 'ui'
const RULES: [AddonCategory, RegExp][] = [
	[
		'hardcore',
		/\bhardcore\b|\bhc\b|death.?log|unitscan/i
	],
	[
		'raid',
		/\braid\b|\bboss(es)?\b|\bwigs\b|encounter|threat|decurs|dispel|\brinse\b|masterloot|soft.?reserve|consolidated buff|tactic/i
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
		/\bquest\b|\bmap\b|zone level|travel|leveling|\brested\b|\bxp\b/i
	],
	[
		'combat',
		/damage meter|\bdps\b|\bproc\b|combat|castbar|nameplate/i
	],
	[
		'social',
		/\bchat\b|whisper|\bguild\b|\bfriend|\bmail\b|calendar|roleplay|\brp\b|bulletin/i
	],
	[
		'ui',
		/\bui\b|interface|\bhud\b|action bar|spellbook|\bskin|flyout|resource bar/i
	]
];

export const categorizeAddon = (name: string, description?: string): AddonCategory => {
	const text = `${name} ${description ?? ''}`;
	for (const [category, pattern] of RULES) if (pattern.test(text)) return category;
	return 'misc';
};
