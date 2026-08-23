import { createTRPCRouter } from './trpc';
import { addonsRouter } from './routers/addonts';
import { launcherRouter } from './routers/launcher';
import { updaterRouter } from './routers/updater';
import { patcherRouter } from './routers/patcher';
import { generalRouter } from './routers/general';
import { preferencesRouter } from './routers/preferences';
import { newsRouter } from './routers/news';
import { forumRouter } from './routers/forum';
import { modsRouter } from './routers/mods';
import { selfUpdaterRouter } from './routers/selfUpdater';
import { discoverRouter } from './routers/discover';
import { visualPacksRouter } from './routers/visualPacks';

export const appRouter = createTRPCRouter({
	addons: addonsRouter,
	general: generalRouter,
	preferences: preferencesRouter,
	launcher: launcherRouter,
	patcher: patcherRouter,
	updater: updaterRouter,
	news: newsRouter,
	forum: forumRouter,
	mods: modsRouter,
	selfUpdater: selfUpdaterRouter,
	discover: discoverRouter,
	visualPacks: visualPacksRouter
});

export type AppRouter = typeof appRouter;
