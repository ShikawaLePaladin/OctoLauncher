# OctoLauncher — project instructions

## What this is

Electron desktop launcher for **OctoWoW**, a World of Warcraft **1.12.1 (build 5875)** private
server. MIT licensed, hosted on Gitea at `octowow.st/git`. It:

- downloads / verifies the game client (HTTP CDN **and** a torrent path via aria2),
- rewrites `WTF/Config.wtf` on every launch and owns some of its keys,
- binary-patches a **clean** `WoW.exe` fetched from the CDN (FOV, far clip, large-address, …),
- installs client mods (DXVK, VanillaFixes, nampower, SuperWoW, …) loaded through the VanillaFixes
  chainloader (`dlls.txt`),
- installs git-based addons, adds Windows Defender exclusions, self-updates via NSIS.

**Audience: non-technical Windows players with wildly different hardware.** A launcher bug means a
player cannot play, or a corrupted multi-GB client install. Correctness, idempotence and
recoverability beat elegance.

## Repository state — read this first

Two remotes matter:

| | Version | State |
|---|---|---|
| `OctoWoW/OctoLauncher` (upstream) | **1.3.6** | ~10 700 lines. The real baseline. |
| `shaga/OctoLauncher` (this fork) | 1.0.27 | ~6 600 lines, single squashed commit, 3 releases behind. |

The fork predates a large amount of upstream work (torrent sync, hardware detection, Defender
exclusions, i18n, atomic settings writes, DXVK file parking, sha256 verification). **Never write a
fix against the fork's code without checking whether upstream 1.3.6 already fixed it** — most of the
obvious bugs are already gone upstream. See `docs/AUDIT.md`.

The goal is to stay mergeable with upstream: small commits, no gratuitous restructuring.

## Working agreement

1. **Answer the user in French.** Code, identifiers, comments, docs and commit messages stay in
   English.
2. **Never guess at binary offsets, WoW internals, GPU capabilities or mod behaviour.** Read the
   code, check upstream, or say you are unsure. A wrong offset corrupts `WoW.exe`.
3. Before changing anything that writes into the player's client directory, state what is written,
   where, and how it is undone.
4. Do not commit, push, tag or open a PR unless explicitly asked.
5. No secrets or tokens in the repo. `.env` is gitignored; `.env.production` is committed on purpose
   and must stay free of secrets.
6. Say plainly what you did **not** verify. There is no test suite; unverified is the default.

## Architecture

Three Vite bundles (`electron.vite.config.ts`), wired together by **tRPC over Electron IPC**:

| Layer | Path | Rules |
|---|---|---|
| Main | `src/main/` | Owns *all* filesystem, network, native and process work. |
| Preload | `src/preload/` | `exposeElectronTRPC()` bridge only. Nothing else goes through it. |
| Renderer | `src/renderer/` | React 18 + Tailwind. **No Node, no `fs`, no `require`.** |

- Every renderer→main call is a tRPC procedure in `src/main/api/routers/`, registered in
  `src/main/api/root.ts`. **Never add `ipcMain.handle`.**
- Every cross-process data shape is a Zod schema in `src/common/schemas.ts`. Validate tRPC inputs
  with Zod, always.
- Long-lived main-process state extends `Observable` (`src/main/modules/observable.ts`) and is
  streamed to the renderer via tRPC subscriptions.
- Path aliases `~common`, `~main`, `~renderer`, `~build` are declared in **both**
  `electron.vite.config.ts` and `tsconfig.*.json` — update both.

### Module map (upstream 1.3.6)

| File | Responsibility |
|---|---|
| `modules/updater.ts` | CDN manifest, hashing, download/resume, client verify + repair. The riskiest module: it deletes files. |
| `modules/aria2.ts` | Torrent-based client sync (bundled aria2 binary), seeding, resume state. |
| `modules/upnp.ts` | Best-effort UPnP-IGD port mapping for the seeder. Must no-op silently on failure. |
| `modules/mods.ts` | Mod install/uninstall, sha256 verification, DXVK `d3d9.dll` parking (`.off`). |
| `modules/patcher.ts` | `Config.wtf` ownership + `WoW.exe` binary tweaks + `ensureDxvkConf()`. |
| `modules/hardware.ts` | RAM / CPU / VRAM / GPU model detection, `recommendFarClip()`. |
| `modules/displays.ts` | Display enumeration, primary display index. |
| `modules/defender.ts` | Windows Defender exclusions, antivirus-block detection. |
| `modules/localePatch.ts` | MPQ locale patch cleanup via `stormlib-node`. |
| `modules/dllsTxt.ts` | Serialized read/modify/write of `dlls.txt` (chainloader list). |
| `modules/preferences.ts` | `settings.json`, atomic write via `.tmp` + rename, with recovery. |
| `api/routers/launcher.ts` | Launch sequence: patch config → `ensureDxvkConf` → spawn `VanillaFixes.exe WoW.exe`. |
| `common/mods.ts` | **Hardcoded mod catalogue** (URLs, versions, extract maps, optional sha256). |
| `server/` | Standalone dev CDN. Not bundled into the app. |

## Domain knowledge you must not get wrong

- **File offsets vs virtual addresses.** The tweaks in `patcher.ts` index into a `Buffer` of the raw
  `WoW.exe` — they are **file offsets**. WoW 1.12.1 is a 32-bit PE with image base `0x400000`, so a
  disassembler VA of `0x006E5FB8` is *not* a file offset. Mixing them silently does nothing:
  `Buffer.copy` past the end writes zero bytes and throws nothing. Always state which one you mean.
- **`patchExecutable()` is idempotent by design**: it re-downloads a clean `WoW.exe` and re-applies
  every tweak. Never patch the file already on disk.
- **The chainloader.** `dlls.txt` is read by VanillaFixes, which must load before the client
  initialises — hence launching through `VanillaFixes.exe`, not injecting after `spawn`. Mods
  declaring `requires: ['vanillaFixes']` are dead weight without it.
- **`d3d9.dll` is launcher-owned** (`LAUNCHER_OWNED_FILES` in `aria2.ts`). Disabling DXVK *parks* it
  as `d3d9.dll.off` rather than deleting it, and its sha256 is pinned (`DXVK_DLL_SHA256` in
  `mods.ts`). Any change here must keep the updater, the torrent sync and the mod installer from
  fighting over that file.
- **Anything written into `clientDir` must be recorded** in `installedFiles`
  (`Preferences.data.mods[id]`) so the updater does not delete or re-download it.
- **DXVK is hardware-sensitive.** DXVK 2.x needs Vulkan 1.3 drivers; older GPUs need the 1.10.3
  line; some have no Vulkan at all. The game is 32-bit, so it needs the **x32** `d3d9.dll` *and* a
  **32-bit** Vulkan ICD on the machine. The launcher currently ships one build to everyone and
  detects none of this — that is the open work item, see `docs/PLAN.md`.

## Conventions

- TypeScript strict. **Tabs**, single quotes. Prettier `@haaxor1689/prettier-config`, ESLint
  `@haaxor1689/eslint-config`. Match the file you edit; never reformat untouched lines.
- Arrow function consts over `function` declarations (`eslint-plugin-prefer-arrow`).
- Private class members use `#field`, not `private`.
- Logging goes through `electron-log/main` — never bare `console.log` in main. Player logs are the
  only diagnostics we ever get, so log **decisions**, not noise.
- New user-facing strings go through the i18n layer (`src/renderer/i18n/`), not inline literals.

## Environment traps (read before running anything)

- **Node 20 LTS only.** Node 22+ breaks `dll-inject`'s `nan` bindings. Check `node -v` first.
- Native modules (`dll-inject`, `stormlib-node`) need VS 2022 Build Tools + Windows SDK + Python 3.
- In VSCode and some terminals `ELECTRON_RUN_AS_NODE=1` is set and crashes Electron:
  `Remove-Item Env:ELECTRON_RUN_AS_NODE` before `npm run dev` / `npm run dist`.
- `postinstall` runs `node scripts/scrub-native-paths.cjs`. That file exists upstream but **the fork
  gitignores `scripts/`**, so on this clone `npm install` must be run as:
  ```bash
  npm install --ignore-scripts --no-audit --no-fund
  node node_modules/electron/install.js
  node_modules/.bin/electron-builder.cmd install-app-deps
  ```
- `tar` is imported by `modules/mods.ts` but declared in neither fork nor upstream `package.json` —
  it resolves only through hoisting. DXVK is the only `tar.gz` mod, so this breaks DXVK first.

## Verifying a change

No test suite exists. Minimum bar before calling a change done:

```bash
npx tsc --noEmit          # electron-vite build does NOT typecheck
npm run build             # bundles main + preload + renderer
```

Anything touching `updater.ts`, `aria2.ts`, `patcher.ts`, `mods.ts` or the launch sequence must be
tried against a real WoW 1.12.1 install before being called done. If you could not test it, say so.

## Out of scope unless asked

- Changing the client/CDN or torrent protocol (needs a coordinated server change; the server is not
  in this repository and the user has no access to it).
- Bumping Electron / React / tRPC major versions.
- Reformatting, renaming or restructuring files the current task does not touch.
