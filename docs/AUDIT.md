# Audit OctoLauncher — 20 août 2026

## 0. Correction de cadrage, à lire en premier

J'ai commencé par auditer le fork `shaga/OctoLauncher` (commit `530ec7a`, version 1.0.27, ~6 600
lignes). En vérifiant l'upstream `OctoWoW/OctoLauncher`, il s'avère que celui-ci est en **1.3.6**,
~10 700 lignes, et qu'il **corrige déjà la quasi-totalité des défauts trouvés dans le fork**.

Auditer le fork n'avait donc qu'un intérêt limité : la bonne base de travail est l'upstream. Ce
document est recalé en conséquence.

| | Version | Taille | Commits |
|---|---|---|---|
| `OctoWoW/OctoLauncher` (upstream) | **1.3.6** | ~10 700 lignes | 1.3.1 → 1.3.5 → 1.3.6 (14 août 2026) |
| `shaga/OctoLauncher` (ton fork) | 1.0.27 | ~6 600 lignes | 1 commit « Initial commit », 3 releases de retard |

Ce que l'upstream a ajouté et que le fork n'a pas du tout : synchronisation du client par
**torrent** (`aria2.ts`, 514 lignes) avec **UPnP** pour le seeding (`upnp.ts`, 374 lignes),
**détection matérielle** (`hardware.ts`), **énumération des écrans** (`displays.ts`), **exclusions
Windows Defender** (`defender.ts`), nettoyage des patchs de locale MPQ (`localePatch.ts`),
**internationalisation** (`src/renderer/i18n/`), onglet forum, et le mod `superWow`.

**Conclusion opérationnelle : resynchroniser le fork sur l'upstream 1.3.6 est de loin l'action à
plus fort rendement. Elle vaut plus que tous les correctifs listés en annexe.**

---

## 1. Ce qui est déjà corrigé en amont

Constats relevés dans le fork, vérifiés comme **résolus dans l'upstream 1.3.6** :

| Constat (fork 1.0.27) | État upstream 1.3.6 |
|---|---|
| Nettoyage WDB appliqué au mauvais chemin (`WoW.exe/WDB`) | Corrigé — `path.join(clientDir, 'WDB')` |
| Injection de VanillaFixes en course avec le démarrage du jeu | Corrigé — lancement via `VanillaFixes.exe WoW.exe`, plus d'injection après coup |
| `WoW.exe` lancé sans répertoire de travail | Corrigé — `cwd: clientDir` |
| Résolution écrite en pixels logiques sur écran HiDPI | Corrigé — `scaleFactor` pris en compte, et notion de « clé possédée par le launcher » vs choix du joueur |
| `settings.json` écrit sans `await` ni atomicité | Corrigé — écriture `.tmp` + `rename` avec réessais, et récupération du `.tmp` au démarrage |
| Tweak `crossFactionResurrect` inopérant (adresses virtuelles au lieu d'offsets fichier) | Supprimé |
| Téléchargements de DLL sans vérification d'intégrité | Mécanisme en place — `sha256` optionnel par mod, refus d'installation si non-correspondance |
| Conflit de propriété sur `d3d9.dll` entre mod DXVK et bundle serveur | Résolu — `d3d9.dll` est déclaré « propriété du launcher », désactiver DXVK le *gare* en `d3d9.dll.off` au lieu de le supprimer, et son sha256 est épinglé |
| Aucun `dxvk.conf` généré | Ajouté — `ensureDxvkConf()` écrit une configuration par défaut |

Autrement dit : **les bugs ne sont pas à corriger, ils sont à récupérer.**

---

## 2. Ce qui reste réellement ouvert dans l'upstream 1.3.6

Ces points ont été vérifiés dans le code de l'upstream, pas dans celui du fork.

### R1 — DXVK : une seule version pour tout le monde — Élevé, c'est ton sujet

`src/common/mods.ts` : `dxvk-gplasync v2.7.1-1`, dossier `x32`, `recommended: true`. Aucune
détection du GPU, du pilote, de la présence de Vulkan ni de la version supportée. Le mod est
recommandé activement à tous les joueurs, y compris ceux dont le matériel ne peut pas l'exécuter.

- DXVK 2.x exige des pilotes **Vulkan 1.3**. En dessous — Intel HD antérieur à Skylake, Nvidia Fermi
  et antérieurs, AMD Terascale — c'est la branche **DXVK 1.10.3** qui est la dernière utilisable,
  voire rien du tout.
- Le client est 32 bits : il faut le `d3d9.dll` x32 (c'est bien le cas) **et** un ICD Vulkan 32 bits
  sur la machine (`vulkan-1.dll` dans `SysWOW64`). Certains pilotes OEM anciens n'installent que la
  partie 64 bits. Rien ne le vérifie.
- Aucun repli : si DXVK ne démarre pas, le joueur voit un jeu qui ne se lance pas, sans message et
  sans retour automatique au D3D9 natif.

**Base déjà disponible pour construire ça :** `modules/hardware.ts` détecte déjà RAM, cœurs CPU,
VRAM (registre Windows) et modèle GPU (`app.getGPUInfo`), avec un schéma versionné
(`HARDWARE_SCHEMA_VERSION`) et un exemple de règle de recommandation (`recommendFarClip`). La même
mécanique peut porter une recommandation DXVK. **Il manque uniquement la partie Vulkan.**

### R2 — `dxvk.conf` : correct mais figé — Moyen

`patcher.ts:527` `ensureDxvkConf()` écrit `d3d9.maxAvailableMemory = 2048`,
`d3d9.maxFrameLatency = 1`, `dxvk.numCompilerThreads = 2`, `dxvk.logLevel = none`. Bons réglages,
mais :

- le fichier n'est écrit **que s'il est absent** : il n'est jamais mis à jour ensuite ;
- `numCompilerThreads = 2` est figé alors que `hardware.ts` connaît le nombre de cœurs ;
- **aucune sélection de GPU** : sur les portables hybrides (Optimus / AMD Switchable), DXVK peut
  retenir l'iGPU Intel au lieu du GPU dédié — performances catastrophiques, et le joueur croit
  jouer sur sa carte dédiée ;
- pas de `dxvk.logLevel` exploitable pour diagnostiquer à distance (mis à `none`), ce qui est
  cohérent en usage normal mais empêche tout diagnostic quand un joueur signale un problème.

### R3 — `tar` importé mais non déclaré — Élevé, correctif trivial

`src/main/modules/mods.ts:7` : `import * as tar from 'tar'`, alors que `tar` n'est dans les
`dependencies` **ni du fork, ni de l'upstream**. Ça ne fonctionne que par remontée à plat depuis
`node-gyp` / `electron-builder`.

DXVK est **le seul mod distribué en `.tar.gz`**. Une résolution de dépendances différente, ou un
`electron-builder` qui n'embarque pas un paquet non déclaré dans l'asar, se manifeste exactement
comme « l'installation de DXVK échoue » — en dev comme en production. C'est un correctif d'une
ligne, contribuable tel quel en amont.

### R4 — Aucun `sha256` réellement épinglé pour les mods — Moyen

Le mécanisme de vérification existe et fonctionne (`mods.ts` refuse l'installation en cas de
non-correspondance), et le `d3d9.dll` de DXVK a bien une empreinte de référence
(`DXVK_DLL_SHA256`). Mais **aucune entrée du catalogue `MODS` ne déclare de `sha256`** : les DLL de
nampower, transmogfix, UnitXP, VanillaHelpers, SuperWoW sont téléchargées depuis GitHub / Codeberg /
Gitea et injectées dans le process du jeu sans contrôle d'intégrité. Renseigner ces empreintes est
peu coûteux et fermerait une vraie surface d'attaque.

### R5 — Toujours pas de tests automatisés — structurel

Aucun framework, aucun test. Sur ~10 700 lignes dont un updater qui supprime des fichiers et un
patcher qui écrit dans un exécutable, chaque modification se valide à la main sur un vrai client.
C'est le principal frein à toute évolution sérieuse, y compris au chantier DXVK.

### Réserve honnête

Les points R1 à R5 viennent de vérifications ciblées sur l'upstream (catalogue de mods, `dxvk.conf`,
séquence de lancement, préférences, dépendances), **pas d'une relecture complète des 10 700 lignes
de la 1.3.6**. Un audit complet de cette version reste à faire — il est inscrit comme phase 1 du
plan.

---

## Annexe — constats sur le fork 1.0.27

Utile uniquement si tu décides de **ne pas** resynchroniser. Chacun de ces points est déjà réglé en
amont ; les corriger à la main dans le fork serait du travail refait deux fois.

- `npm install` échoue sur un clone frais : `postinstall` appelle `scripts/scrub-native-paths.cjs`,
  or `.gitignore:19` ignore `scripts/`. Le fichier existe bien dans l'upstream. *(Contournement
  vérifié : `npm install --ignore-scripts` fonctionne — testé, installation réussie.)*
- Nettoyage WDB inopérant — `launcher.ts:62`.
- Course entre `spawn()` et `inject()` — `launcher.ts:69-89`.
- `spawn` sans `cwd` — `launcher.ts:69`.
- Tweak `crossFactionResurrect` mort — `patcher.ts:83-91`. Comportement **reproduit** : Node n'émet
  aucune erreur quand `Buffer.copy` vise au-delà de la fin du tampon ; le patch ne s'applique jamais
  et rien ne le signale.
- Résolution HiDPI erronée — `patcher.ts:178-184`.
- `gxRefresh` figé à 60 et MSAA 8× imposés — `patcher.ts:185-188`.
- `settings.json` corruptible — `preferences.ts:44-51`.
- Promesses non gérées au démarrage — `index.ts:91-93`.
- `Config.wtf` supprimé avant réécriture, sans sauvegarde — `patcher.ts:161-176`.
- `openExternal` sans filtrage de schéma — `general.ts:14-16` et `index.ts:70-73`. **À revérifier
  dans la 1.3.6** : non contrôlé lors de cet audit.
- CI sans `tsc --noEmit` ni lint — workflow identique dans les deux dépôts, donc **toujours ouvert
  en amont**.
