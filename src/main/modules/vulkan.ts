import os from 'node:os';
import { execFile } from 'node:child_process';

import Logger from 'electron-log/main';

import type { VulkanInfo } from '~common/schemas';
import type { DxvkVariantId } from '~common/mods';

export const VULKAN_SCHEMA_VERSION = 1;

// 32-bit ICD keys are what matter: WoW.exe is a 32-bit process, so a Vulkan
// driver only registered under the 64-bit key is invisible to it.
const ICD_KEYS_32 = [
	'HKLM\\SOFTWARE\\WOW6432Node\\Khronos\\Vulkan\\Drivers',
	'HKCU\\SOFTWARE\\WOW6432Node\\Khronos\\Vulkan\\Drivers'
];
const ICD_KEYS_64 = [
	'HKLM\\SOFTWARE\\Khronos\\Vulkan\\Drivers',
	'HKCU\\SOFTWARE\\Khronos\\Vulkan\\Drivers'
];

const regKeyHasValues = (regPath: string): Promise<boolean> =>
	new Promise(resolve => {
		execFile(
			'reg',
			['query', regPath],
			{ windowsHide: true, timeout: 5000 },
			(error, stdout) => {
				if (error) return resolve(false);
				// each registered ICD is a REG_DWORD value under the key
				resolve(/REG_DWORD/.test(stdout));
			}
		);
	});

const anyKeyHasIcd = async (paths: string[]): Promise<boolean> => {
	const results = await Promise.all(paths.map(regKeyHasValues));
	return results.some(Boolean);
};

export const detectVulkan = async (): Promise<VulkanInfo> => {
	if (os.platform() !== 'win32') {
		return {
			icd32Present: false,
			icd64Present: false,
			detectedAt: new Date().toISOString(),
			schemaVersion: VULKAN_SCHEMA_VERSION
		};
	}

	const [icd32Present, icd64Present] = await Promise.all([
		anyKeyHasIcd(ICD_KEYS_32).catch(() => false),
		anyKeyHasIcd(ICD_KEYS_64).catch(() => false)
	]);

	const info: VulkanInfo = {
		icd32Present,
		icd64Present,
		detectedAt: new Date().toISOString(),
		schemaVersion: VULKAN_SCHEMA_VERSION
	};
	Logger.info('Detected Vulkan ICD presence', info);
	return info;
};

// Approximate GPU generation classifier from the renderer string Chromium
// reports (app.getGPUInfo's glRenderer, e.g. "ANGLE (NVIDIA, NVIDIA GeForce
// GTX 1660 Ti (0x00002191) Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.15.3623)").
// This is a heuristic, not a driver capability query: when uncertain it
// deliberately falls back to the older/safer DXVK build rather than the one
// that requires Vulkan 1.3, since a wrong "modern" guess produces a black
// screen while a wrong "legacy" guess merely under-recommends performance.
export type GpuGeneration = 'modern' | 'legacy' | 'unknown';

export const classifyGpuGeneration = (gpuModel: string): GpuGeneration => {
	const s = gpuModel.toLowerCase();

	if (/\b(nvidia|geforce|quadro|rtx|gtx)\b/.test(s)) {
		// GTX 900 (Maxwell 2nd gen, 2014) and newer reliably ship current
		// Vulkan 1.3 drivers; anything numbered lower, or GT-class parts,
		// predates that generation.
		const m = s.match(/\b(?:gtx|rtx|gt)\s*(\d{3,4})/);
		if (m) {
			const num = parseInt(m[1], 10);
			if (/\brtx\b/.test(s)) return 'modern';
			if (num >= 900) return 'modern';
			if (num >= 600) return 'legacy';
			return 'legacy';
		}
		return 'unknown';
	}

	if (/\b(amd|radeon|ati)\b/.test(s)) {
		// RX series (Polaris/GCN4, 2016) and newer are safely modern; older
		// R9/R7/HD-branded GCN parts get "legacy" rather than "modern".
		if (/\brx\s*\d{3,4}/.test(s)) return 'modern';
		if (/\b(r9|r7|r5|hd)\s*\d{3,4}/.test(s)) return 'legacy';
		return 'unknown';
	}

	if (/\bintel\b/.test(s)) {
		// UHD/Iris (Skylake+, 2015) is modern; numbered "HD Graphics 4000-5999"
		// (Haswell/Broadwell) is legacy; anything older is unknown/very old.
		if (/\b(uhd|iris)\b/.test(s)) return 'modern';
		const m = s.match(/hd graphics\s*(\d{3,4})/);
		if (m) {
			const num = parseInt(m[1], 10);
			if (num >= 4000) return 'legacy';
			return 'unknown';
		}
		return 'unknown';
	}

	return 'unknown';
};

export const recommendDxvkVariant = (
	vulkan: VulkanInfo | null,
	gpuModel: string | null
): DxvkVariantId | 'none' => {
	if (!vulkan?.icd32Present) return 'none';

	const gen = classifyGpuGeneration(gpuModel ?? '');
	if (gen === 'modern') return 'gplasync';
	// legacy or unknown-but-Vulkan-present: prefer the older, less demanding
	// build over risking a Vulkan 1.3 mismatch.
	return 'legacy';
};
