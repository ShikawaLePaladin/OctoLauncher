import path from 'path';

import { z } from 'zod';

import Mods from '~main/modules/mods';
import Preferences from '~main/modules/preferences';
import { isGameRunning } from '~main/modules/updater';
import { dxvkConfOwner, ensureDxvkConf } from '~main/modules/patcher';
import { ModIdSchema } from '~common/mods';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const modsRouter = createTRPCRouter({
	list: publicProcedure.query(() => Mods.status),
	verify: publicProcedure.mutation(() => Mods.verify()),
	toggle: publicProcedure
		.input(z.object({ id: ModIdSchema, enabled: z.boolean() }))
		.mutation(({ input }) => Mods.toggle(input.id, input.enabled)),
	toggleCustom: publicProcedure
		.input(z.object({ name: z.string(), enabled: z.boolean() }))
		.mutation(({ input }) => Mods.toggleCustom(input.name, input.enabled)),
	addCustomDll: publicProcedure
		.input(z.object({ path: z.string() }))
		.mutation(({ input }) => Mods.addCustomDll(input.path)),
	setIgnoreUpdates: publicProcedure
		.input(z.object({ id: ModIdSchema, ignore: z.boolean() }))
		.mutation(({ input }) => Mods.setIgnoreUpdates(input.id, input.ignore)),
	dxvkStatus: publicProcedure.query(() => Mods.dxvkStatus()),
	setDxvkVariant: publicProcedure
		.input(z.enum(['auto', 'gplasync', 'legacy', 'none']))
		.mutation(({ input }) => Mods.setDxvkVariant(input)),
	dxvkTuning: publicProcedure.query(async () => ({
		preset: Preferences.data.dxvkPreset,
		showFps: Preferences.data.dxvkShowFps,
		confOwner: Preferences.data.clientDir
			? await dxvkConfOwner(Preferences.data.clientDir)
			: 'missing'
	})),
	setDxvkPreset: publicProcedure
		.input(z.enum(['balanced', 'lowEnd', 'performance']))
		.mutation(({ input }) => {
			Preferences.data = { dxvkPreset: input };
		}),
	setDxvkShowFps: publicProcedure
		.input(z.boolean())
		.mutation(({ input }) => {
			Preferences.data = { dxvkShowFps: input };
		}),
	confirmDxvkConfTakeover: publicProcedure.mutation(async () => {
		Preferences.data = { dxvkConfTakeover: true };
		const clientDir = Preferences.data?.clientDir;
		if (clientDir) await ensureDxvkConf(clientDir);
	}),
	applyAll: publicProcedure.mutation(() => Mods.applyAll()),
	repair: publicProcedure.mutation(async () => {
		const clientDir = Preferences.data?.clientDir;
		if (clientDir) {
			const exePath = path.join(clientDir, 'WoW.exe');
			if (await isGameRunning(exePath))
				throw new Error('Please close WoW first before verifying files.');
		}
		return Mods.applyAll({ repairOnly: true });
	}),
	observe: publicProcedure.subscription(() => Mods.observe())
});
