# Plan de travail OctoLauncher

Établi le 20 août 2026, à partir de [AUDIT.md](AUDIT.md). Les identifiants (R1, R3…) renvoient à ce
document.

## Le point de départ a changé

L'audit devait servir à corriger le fork. Il a montré autre chose : le fork est en 1.0.27 quand
l'upstream est en 1.3.6, et l'upstream a déjà corrigé presque tout ce qu'on aurait pu réparer à la
main. **La première tâche n'est donc pas de coder, c'est de se remettre à niveau.**

Ce qui reste à construire après ça se réduit à un sujet principal — **DXVK adapté au matériel du
joueur** — plus deux ou trois correctifs courts qui se contribuent tels quels en amont.

## Contraintes retenues

- **Rester alignable avec l'upstream** (ton choix) : petits commits, pas de restructuration
  gratuite, chaque correction proposable en PR à `OctoWoW/OctoLauncher`.
- **Pas d'accès au serveur / CDN** : la vérification du Gitea confirme qu'il n'y a que le launcher et
  des addons, aucun dépôt serveur ou site. Tout ce qu'on conçoit doit donc **tenir côté client**, en
  supposant qu'une mise à jour de DXVK passe par une release du launcher.
- **Environnement de build** : `npm install --ignore-scripts` a réussi sur ta machine (testé).
  Node 20 et git sont présents. Reste à confirmer la compilation des modules natifs, qui exige les
  VS 2022 Build Tools — c'est l'étape 0.3.

---

## Phase 0 — Se remettre à niveau et pouvoir construire

**C'est la phase à plus fort rendement. Elle supprime plus de bugs que n'importe quel correctif
écrit à la main.**

| Étape | Contenu |
|---|---|
| 0.1 | Ajouter le remote `upstream` et récupérer la 1.3.6 |
| 0.2 | Décider de la stratégie : repartir de l'upstream et rejouer tes éventuelles modifications par-dessus (recommandé, le fork n'a qu'un commit squashé), ou tenter une fusion |
| 0.3 | Construire : `npm install` → `npx tsc --noEmit` → `npm run build` → `npm run dev` |
| 0.4 | Ouvrir le launcher, pointer un vrai dossier client, faire un Verify et un lancement — établir la référence « ça marche » |

**Fini quand :** le launcher se construit et se lance depuis une copie à jour de la 1.3.6, et tu as
vu le jeu démarrer avec les mods chargés.

**Risque :** compilation de `dll-inject` et `stormlib-node`. Si VS 2022 Build Tools, le Windows SDK
ou Python 3 manquent, cette étape peut prendre plus de temps que tout le reste. À traiter en premier
pour le savoir tôt.

**Question ouverte :** ton fork contient-il des modifications à toi qu'il faut préserver ? Vu son
historique (un seul commit « Initial commit »), probablement pas — à confirmer avant d'écraser quoi
que ce soit.

---

## Phase 1 — Audit complet de la 1.3.6

L'audit actuel de l'upstream est ciblé, pas exhaustif (voir la réserve dans `AUDIT.md`). Avant
d'ajouter du code à une base de 10 700 lignes, il faut la connaître.

| Étape | Contenu |
|---|---|
| 1.1 | Lecture ciblée des modules ajoutés : `aria2.ts`, `upnp.ts`, `defender.ts`, `hardware.ts`, `displays.ts` |
| 1.2 | Relecture du chemin critique : `updater.ts` et l'interaction updater ↔ torrent ↔ mods sur la propriété des fichiers |
| 1.3 | Revérifier les points restés ouverts : `openExternal` non filtré, CI sans typecheck |
| 1.4 | Mettre `AUDIT.md` à jour avec ce qui aura été trouvé |

**Fini quand :** on peut dire ce que fait chaque module du chemin de lancement sans le relire.

---

## Phase 2 — Correctifs courts, contribuables en amont

Petits diffs, chacun défendable en PR sur l'upstream.

| Étape | Contenu |
|---|---|
| 2.1 | **R3** — déclarer `tar` en dépendance. Une ligne, et c'est un suspect direct des échecs d'installation de DXVK |
| 2.2 | **R4** — épingler un `sha256` par mod dans le catalogue (le mécanisme de vérification existe déjà, il n'attend que les valeurs) |
| 2.3 | Ajouter `tsc --noEmit` et `eslint` au workflow CI |
| 2.4 | **R2** — `dxvk.conf` : dériver `numCompilerThreads` du nombre de cœurs, et permettre la mise à jour du fichier au lieu de l'écrire une seule fois |

**Fini quand :** ces correctifs sont dans une branche propre, un commit chacun, prêts à être proposés
en amont.

---

## Phase 3 — DXVK adapté au matériel

Le sujet principal. Objectif : **ne plus proposer une version unique de DXVK à tout le monde**, mais
la bonne variante — ou aucune — selon la machine du joueur.

| Étape | Contenu |
|---|---|
| 3.1 | **Détection Vulkan** : présence et version de l'ICD, en distinguant bien 64 bits et **32 bits** (`SysWOW64`). Pistes : lecture du registre des ICD Vulkan, `vulkaninfo` embarqué, ou sonde maison. À arbitrer sur les critères : fiabilité, taille ajoutée au binaire, risque de faux positif antivirus |
| 3.2 | **Classification GPU** : à partir de `hardware.ts` (`app.getGPUInfo` donne déjà le `glRenderer`), déterminer génération et famille de pilotes |
| 3.3 | **Matrice de décision** : DXVK 2.x gplasync / branche 1.10.3 / pas de DXVK. Versionnée, testable en isolation, et lisible dans les logs |
| 3.4 | **Catalogue à variantes** : `src/common/mods.ts` doit pouvoir décrire plusieurs builds d'un même mod et en choisir un. C'est le changement structurel de la phase |
| 3.5 | **Sélection de GPU dans `dxvk.conf`** pour les portables hybrides |
| 3.6 | **Repli et message** : détecter l'échec au lancement, revenir au D3D9 natif, et expliquer au joueur ce qui s'est passé plutôt que de le laisser devant un jeu qui ne démarre pas |

**Fini quand :** sur une machine sans Vulkan, DXVK n'est ni installé ni recommandé et le joueur sait
pourquoi ; sur une machine ancienne, c'est la 1.10.3 qui est posée ; sur un portable hybride, le jeu
tourne sur le GPU dédié.

**Arbitrage à faire dès 3.1 :** jusqu'où pousser la détection ? Une sonde Vulkan embarquée est
précise mais alourdit le binaire et peut alerter les antivirus — sujet sensible ici, l'upstream a
déjà dû ajouter un module d'exclusions Defender. Une heuristique par registre et modèle de GPU est
plus légère mais faillible. Ma recommandation : registre en priorité, sonde en secours, et **toujours
un choix manuel dans l'interface** pour que le joueur puisse passer outre.

**Prérequis honnête :** cette phase se conçoit à l'aveugle tant qu'on n'a pas de retours réels. Si
tu peux collecter, même informellement, les GPU des joueurs qui se plaignent et leurs symptômes
exacts, la matrice 3.3 sera bâtie sur des faits plutôt que sur des tableaux de compatibilité
génériques.

---

## Phase 4 — Fondations

À mener en parallèle de la phase 3 dès qu'elle se stabilise.

| Étape | Contenu |
|---|---|
| 4.1 | **R5** — installer Vitest et couvrir en priorité la matrice de décision DXVK, le parseur `Config.wtf`, `dllsTxt` et la résolution des mods |
| 4.2 | Découper `updater.ts` (manifeste / hash / téléchargement / réconciliation) |
| 4.3 | Documenter le contrat updater ↔ torrent ↔ mods : qui possède quel fichier |

La matrice DXVK est précisément le genre de logique qui se teste sans machine réelle : une entrée
matérielle, une décision attendue. Écrire ses tests en même temps qu'elle coûte peu et évite de
devoir retrouver dix configurations différentes pour valider une modification.

---

## Hors périmètre

- Modifier le protocole client/CDN ou torrent : pas d'accès serveur, et ça imposerait un changement
  coordonné.
- Refonte visuelle de l'interface.
- Montées de versions majeures Electron / React / tRPC.
- Toute publication de release.

---

## Répartition des modèles

- **Opus 5** — analyse, arbitrages (3.1, 3.3, 3.4), relecture des diffs qui touchent au dossier
  client.
- **Sonnet 5** — exécution des phases 0, 2, 4.1, et de tout ce qui est cadré par ce document.

`CLAUDE.md`, à la racine du dépôt, est chargé automatiquement à chaque session : offsets fichier vs
adresses virtuelles, tRPC obligatoire, Node 20, traçabilité des fichiers écrits dans le dossier du
joueur, et l'avertissement de vérifier l'upstream avant de corriger quoi que ce soit.
