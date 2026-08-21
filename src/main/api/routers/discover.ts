import { fetchAddons } from '~main/modules/addons';
import { getAddonStats } from '~main/modules/addonStats';
import { categorizeAddon } from '~common/addonCategories';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const discoverRouter = createTRPCRouter({
	catalog: publicProcedure.query(async () => {
		const addons = await fetchAddons();
		const stats = await getAddonStats(addons.map(a => a.git));
		return addons.map(a => ({
			...a,
			...stats[a.git],
			category: categorizeAddon(a.name, a.description)
		}));
	})
});
