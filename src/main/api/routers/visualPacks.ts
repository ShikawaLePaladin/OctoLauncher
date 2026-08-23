import { z } from 'zod';

import VisualPacks from '~main/modules/visualPacks';
import { VISUAL_PACKS, VisualPackIdSchema } from '~common/visualPacks';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const visualPacksRouter = createTRPCRouter({
	catalog: publicProcedure.query(() => VISUAL_PACKS),
	refresh: publicProcedure.mutation(() => VisualPacks.refresh()),
	install: publicProcedure
		.input(z.object({ id: VisualPackIdSchema, variant: z.string().optional() }))
		.mutation(({ input }) => VisualPacks.install(input.id, input.variant)),
	uninstall: publicProcedure
		.input(VisualPackIdSchema)
		.mutation(({ input }) => VisualPacks.uninstall(input)),
	observe: publicProcedure.subscription(() => VisualPacks.observe())
});
