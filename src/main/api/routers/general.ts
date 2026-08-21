import path from 'node:path';

import { app, dialog, shell } from 'electron';
import { observable } from '@trpc/server/observable';
import Logger from 'electron-log/main';
import { z } from 'zod';

import { mainWindow } from '~main/index';
import Preferences from '~main/modules/preferences';
import {
	addDefenderExclusions,
	detectAntivirusBlocks
} from '~main/modules/defender';
import { detectHardware, recommendFarClip } from '~main/modules/hardware';
import { detectVulkan } from '~main/modules/vulkan';
import Mods from '~main/modules/mods';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const generalRouter = createTRPCRouter({
	appVersion: publicProcedure.query(() => app.getVersion()),
	hardware: publicProcedure.query(() => {
		const hardware = Preferences.data.hardware ?? null;
		return { hardware, recommendedFarClip: recommendFarClip(hardware) };
	}),
	redetectHardware: publicProcedure.mutation(async () => {
		const hardware = await detectHardware();
		Preferences.data = { hardware };
		return { hardware, recommendedFarClip: recommendFarClip(hardware) };
	}),
	redetectVulkan: publicProcedure.mutation(async () => {
		// "Re-check GPU" in the UI: also refresh the GPU model, not just
		// Vulkan presence — otherwise a stale/wrong cached gpuModel keeps
		// feeding the wrong hardware into the dxvk variant recommendation.
		const [vulkan, hardware] = await Promise.all([
			detectVulkan(),
			detectHardware()
		]);
		Preferences.data = { vulkan, hardware };
		await Mods.verify();
		return vulkan;
	}),
	quit: publicProcedure.mutation(() => app.quit()),
	minimize: publicProcedure.mutation(() => mainWindow?.minimize()),
	toggleMaximize: publicProcedure.mutation(() => {
		if (!mainWindow) return;
		if (mainWindow.isMaximized()) mainWindow.unmaximize();
		else mainWindow.maximize();
	}),
	isMaximized: publicProcedure.subscription(() =>
		observable<boolean>(emit => {
			if (!mainWindow) return;
			emit.next(mainWindow.isMaximized());
			const onChange = () => emit.next(!!mainWindow?.isMaximized());
			mainWindow.on('maximize', onChange);
			mainWindow.on('unmaximize', onChange);
			return () => {
				mainWindow?.off('maximize', onChange);
				mainWindow?.off('unmaximize', onChange);
			};
		})
	),
	openLink: publicProcedure
		.input(z.string().url())
		.mutation(({ input }) => shell.openExternal(input)),
	openInstallFolder: publicProcedure.mutation(() => {
		// Explorer needs native separators; a stored forward-slash path fails to open.
		const dir = Preferences.data.clientDir;
		if (dir) shell.openPath(path.normalize(dir));
	}),
	openLogFile: publicProcedure.mutation(() => {
		const file = Logger.transports.file.getFile().path;
		shell.openPath(path.normalize(file));
	}),
	addDefenderExclusion: publicProcedure.mutation(() => addDefenderExclusions()),
	antivirusBlocks: publicProcedure.query(() => detectAntivirusBlocks()),
	filePicker: publicProcedure
		.input(
			z.object({
				title: z.string().optional(),
				message: z.string().optional(),
				filters: z
					.array(
						z.object({
							name: z.string(),
							extensions: z.array(z.string())
						})
					)
					.optional(),
				properties: z
					.array(
						z.enum([
							'openDirectory',
							'openFile',
							'multiSelections',
							'showHiddenFiles',
							'createDirectory',
							'promptToCreate',
							'noResolveAliases',
							'treatPackageAsDirectory',
							'dontAddToRecent'
						])
					)
					.optional()
			})
		)
		.mutation(async ({ input }) => {
			if (!mainWindow) return { canceled: true } as const;
			const { canceled, filePaths } = await dialog.showOpenDialog(
				mainWindow,
				input
			);

			return canceled
				? ({ canceled: true } as const)
				: ({
						canceled: false,
						path: filePaths as [string, ...string[]]
				  } as const);
		})
});
