import { useState } from 'react';
import { ExternalLink, AlertTriangle, Download, Trash2 } from 'lucide-react';
import cls from 'classnames';

import { api } from '~renderer/utils/api';
import useScrollHint from '~renderer/utils/useScrollHint';
import { useT } from '~renderer/i18n';
import { VISUAL_PACKS, type VisualPackEntry } from '~common/visualPacks';
import { type VisualPacksStatus, type VisualPackRowStatus } from '~main/types';

import TextButton from '../styled/TextButton';

const fmtSize = (bytes: number) =>
	bytes >= 1024 ** 3
		? `${(bytes / 1024 ** 3).toFixed(1)} GB`
		: `${Math.round(bytes / 1024 ** 2)} MB`;

const packSize = (pack: VisualPackEntry, variant?: string): number =>
	pack.file?.size ??
	pack.variants?.find(v => v.id === variant)?.file.size ??
	pack.variants?.[0].file.size ??
	0;

const PackCard = ({
	pack,
	row,
	rows,
	openLink
}: {
	pack: VisualPackEntry;
	row: VisualPackRowStatus | undefined;
	rows: VisualPackRowStatus[];
	openLink: (url: string) => void;
}) => {
	const t = useT();
	const install = api.visualPacks.install.useMutation();
	const uninstall = api.visualPacks.uninstall.useMutation();

	const [pendingVariant, setPendingVariant] = useState<string | undefined>();

	const isInstalled = row?.id === pack.id ? row.installed : false;
	const busy = row?.progress !== undefined;
	const installedRow = (id: string) => rows.find(r => r.id === id);

	const missingDeps = (pack.requires ?? []).filter(dep => {
		if (dep === 'T' && pack.id === 'U') {
			// Ultra HD specifically needs the Ultra Base variant of Patch-T,
			// not just "T installed in any form"
			const tRow = installedRow('T');
			return !tRow?.installed || tRow.installedVariant !== 'ultraBase';
		}
		return !installedRow(dep)?.installed;
	});

	const onInstall = (variant?: string) => {
		setPendingVariant(variant);
		install.mutate({ id: pack.id, variant });
	};

	return (
		<div
			className={cls(
				'flex flex-col gap-2 border p-3',
				pack.serverSpecific
					? 'border-orange/40 bg-orange/5'
					: 'border-blueGray/20 bg-darkerGray/60'
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-2">
					<span>{pack.icon}</span>
					<p className="s1 font-bold text-warmGreen">{pack.patchLabel}</p>
					<p className="s1 font-bold">{pack.name}</p>
				</div>
				<TextButton
					icon={ExternalLink}
					size={14}
					onClick={() => openLink('https://projectreforged.github.io/vanilla/downloads/turtle/')}
					className="!p-0 text-blueGray/60 hocus:text-pink"
				/>
			</div>
			{pack.serverSpecific && (
				<p className="s1 flex items-center gap-1 text-orange">
					<AlertTriangle size={12} className="shrink-0" />
					{t('modsPlus.serverSpecificWarning')}
				</p>
			)}
			<p className="s1 min-h-[32px] text-blueGray">{pack.description}</p>
			{missingDeps.length > 0 && (
				<p className="s1 text-orange">
					{t('modsPlus.requires', { packs: missingDeps.join(', ') })}
				</p>
			)}
			{row?.error && <p className="s1 text-red">{row.error}</p>}

			{pack.variants ? (
				<div className="flex flex-col gap-1">
					{pack.variants.map(v => (
						<div key={v.id} className="flex items-center justify-between gap-2">
							<div>
								<p className="s1 text-blueGray">
									{v.label}{' '}
									<span className="text-blueGray/50">({fmtSize(v.file.size)})</span>
								</p>
								<p className="s1 text-blueGray/50">{v.note}</p>
							</div>
							{isInstalled && row?.installedVariant === v.id ? (
								<TextButton
									icon={Trash2}
									onClick={() => uninstall.mutate(pack.id)}
									loading={uninstall.isLoading}
									className="text-red"
								>
									{t('modsPlus.uninstall')}
								</TextButton>
							) : (
								<TextButton
									icon={Download}
									onClick={() => onInstall(v.id)}
									disabled={missingDeps.length > 0 || busy}
									loading={busy && pendingVariant === v.id}
									className="text-warmGreen"
								>
									{isInstalled ? t('modsPlus.switchTo') : t('modsPlus.install')}
								</TextButton>
							)}
						</div>
					))}
				</div>
			) : (
				<div className="flex items-center justify-between gap-2">
					<p className="s1 text-blueGray/50">{fmtSize(packSize(pack))}</p>
					{isInstalled ? (
						<TextButton
							icon={Trash2}
							onClick={() => uninstall.mutate(pack.id)}
							loading={uninstall.isLoading}
							className="text-red"
						>
							{t('modsPlus.uninstall')}
						</TextButton>
					) : (
						<TextButton
							icon={Download}
							onClick={() => onInstall()}
							disabled={missingDeps.length > 0 || busy}
							loading={busy}
							className="text-warmGreen"
						>
							{t('modsPlus.install')}
						</TextButton>
					)}
				</div>
			)}

			{busy && (
				<div className="h-1 w-full bg-darkGray">
					<div
						className="h-1 bg-orange transition-[width]"
						style={{ width: `${Math.round((row?.progress ?? 0) * 100)}%` }}
					/>
				</div>
			)}
		</div>
	);
};

const ModsPlusTab = () => {
	const t = useT();
	const [status, setStatus] = useState<VisualPacksStatus>({ rows: [] });
	api.visualPacks.observe.useSubscription(undefined, { onData: setStatus });

	const openLink = api.general.openLink.useMutation();
	const scrollRef = useScrollHint<HTMLDivElement>();

	const bde = VISUAL_PACKS.filter(p => p.bundleGroup === 'BDE');
	const core = VISUAL_PACKS.filter(p => ['A', 'C', 'G', 'I'].includes(p.id));
	const optional = VISUAL_PACKS.filter(p => ['L', 'M', 'N', 'P', 'S'].includes(p.id));
	const hdTier = VISUAL_PACKS.filter(p => p.id === 'T');
	const ultraTier = VISUAL_PACKS.filter(p => p.id === 'U');

	const rowFor = (id: string) => status.rows.find(r => r.id === id);

	const bdeAllInstalled = bde.every(p => rowFor(p.id)?.installed);
	const bdeAnyBusy = bde.some(p => rowFor(p.id)?.progress !== undefined);
	const bdeInstall = api.visualPacks.install.useMutation();
	const bdeUninstall = api.visualPacks.uninstall.useMutation();

	return (
		<div className="tw-surface flex min-h-0 flex-grow flex-col gap-3">
			<div className="flex items-center justify-between gap-3">
				<h4 className="tw-color">{t('modsPlus.title')}</h4>
				<TextButton
					icon={ExternalLink}
					onClick={() => openLink.mutate('https://projectreforged.github.io/vanilla/')}
					className="s1 text-blueGray"
				>
					Project Reforged
				</TextButton>
			</div>
			<p className="s1 text-blueGray">{t('modsPlus.intro')}</p>
			<p className="s1 flex items-center gap-1 text-orange">
				<AlertTriangle size={12} className="shrink-0" />
				{t('modsPlus.turtleWarning')}
			</p>
			<hr />
			<div
				ref={scrollRef}
				className="relative -m-4 -mt-3 flex flex-grow flex-col gap-4 overflow-y-auto p-4 pt-3"
			>
				<div className="flex flex-col gap-2">
					<p className="s1 font-bold text-blueGray">{t('modsPlus.group.core')}</p>
					<div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
						{core.map(pack => (
							<PackCard
								key={pack.id}
								pack={pack}
								row={rowFor(pack.id)}
								rows={status.rows}
								openLink={openLink.mutate}
							/>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<p className="s1 font-bold text-blueGray">{t('modsPlus.group.environment')}</p>
					<div className="flex flex-col gap-2 border border-blueGray/20 bg-darkerGray/60 p-3">
						<p className="s1 font-bold text-warmGreen">
							{t('modsPlus.environmentSet')}
						</p>
						<p className="s1 text-blueGray">{t('modsPlus.environmentSetDesc')}</p>
						<p className="s1 text-blueGray/50">
							{fmtSize(bde.reduce((sum, p) => sum + packSize(p), 0))}
						</p>
						{bdeAllInstalled ? (
							<TextButton
								icon={Trash2}
								onClick={() => bde.forEach(p => bdeUninstall.mutate(p.id))}
								loading={bdeUninstall.isLoading}
								className="self-start text-red"
							>
								{t('modsPlus.uninstall')}
							</TextButton>
						) : (
							<TextButton
								icon={Download}
								onClick={() => bde.forEach(p => bdeInstall.mutate({ id: p.id }))}
								disabled={bdeAnyBusy}
								loading={bdeAnyBusy}
								className="self-start text-warmGreen"
							>
								{t('modsPlus.install')}
							</TextButton>
						)}
						{bdeAnyBusy && (
							<div className="h-1 w-full bg-darkGray">
								<div
									className="h-1 bg-orange transition-[width]"
									style={{
										width: `${Math.round(
											(bde.reduce((sum, p) => sum + (rowFor(p.id)?.progress ?? (rowFor(p.id)?.installed ? 1 : 0)), 0) /
												bde.length) *
												100
										)}%`
									}}
								/>
							</div>
						)}
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<p className="s1 font-bold text-blueGray">{t('modsPlus.group.optional')}</p>
					<div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
						{optional.map(pack => (
							<PackCard
								key={pack.id}
								pack={pack}
								row={rowFor(pack.id)}
								rows={status.rows}
								openLink={openLink.mutate}
							/>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<p className="s1 font-bold text-blueGray">{t('modsPlus.group.hd')}</p>
					{hdTier.map(pack => (
						<PackCard
							key={pack.id}
							pack={pack}
							row={rowFor(pack.id)}
							rows={status.rows}
							openLink={openLink.mutate}
						/>
					))}
				</div>

				<div className="flex flex-col gap-2">
					<p className="s1 font-bold text-blueGray">{t('modsPlus.group.ultra')}</p>
					{ultraTier.map(pack => (
						<PackCard
							key={pack.id}
							pack={pack}
							row={rowFor(pack.id)}
							rows={status.rows}
							openLink={openLink.mutate}
						/>
					))}
				</div>
			</div>
		</div>
	);
};

export default ModsPlusTab;
