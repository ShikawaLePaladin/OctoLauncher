import { useMemo, useState } from 'react';
import { Search, Star, ExternalLink, DownloadCloud, Check } from 'lucide-react';
import cls from 'classnames';

import { api } from '~renderer/utils/api';
import useScrollHint from '~renderer/utils/useScrollHint';
import { useT } from '~renderer/i18n';
import { type AddonsStatus } from '~main/types';
import { ADDON_CATEGORIES, type AddonCategory } from '~common/addonCategories';

import TextButton from '../styled/TextButton';
import IconSpinner from '../styled/IconSpinner';

type SortMode = 'popular' | 'recent' | 'name';
type CategoryFilter = AddonCategory | 'all';

type TimeAgo =
	| { key: 'discover.timeAgo.today' }
	| { key: 'discover.timeAgo.days' | 'discover.timeAgo.months' | 'discover.timeAgo.years'; n: number };

const timeAgo = (iso?: string | null): TimeAgo | null => {
	if (!iso) return null;
	const ms = Date.now() - new Date(iso).getTime();
	if (!Number.isFinite(ms)) return null;
	const days = Math.floor(ms / (1000 * 60 * 60 * 24));
	if (days < 1) return { key: 'discover.timeAgo.today' };
	if (days < 30) return { key: 'discover.timeAgo.days', n: days };
	const months = Math.floor(days / 30);
	if (months < 12) return { key: 'discover.timeAgo.months', n: months };
	return { key: 'discover.timeAgo.years', n: Math.floor(months / 12) };
};

const DiscoverTab = () => {
	const t = useT();
	const { data: catalog } = api.discover.catalog.useQuery();
	const [addonsStatus, setAddonsStatus] = useState<AddonsStatus>({
		state: 'verifying',
		addons: {},
		available: []
	});
	api.addons.observe.useSubscription(undefined, { onData: setAddonsStatus });
	const installed = new Set(
		Object.values(addonsStatus.addons).map(a => a.folder)
	);

	const update = api.addons.update.useMutation();
	const openLink = api.general.openLink.useMutation();

	const [filter, setFilter] = useState('');
	const [sort, setSort] = useState<SortMode>('popular');
	const [category, setCategory] = useState<CategoryFilter>('all');
	const [superwowOnly, setSuperwowOnly] = useState(false);
	const scrollRef = useScrollHint<HTMLDivElement>();

	const items = useMemo(() => {
		const q = filter.trim().toLocaleLowerCase();
		const filtered = (catalog ?? []).filter(
			a =>
				(category === 'all' || a.category === category) &&
				(!superwowOnly || !!a.superwow) &&
				(!q ||
					a.name.toLocaleLowerCase().includes(q) ||
					a.description?.toLocaleLowerCase().includes(q))
		);
		const sorted = [...filtered].sort((a, b) => {
			if (sort === 'name') return a.name.localeCompare(b.name);
			if (sort === 'recent')
				return (
					new Date(b.updatedAt ?? 0).getTime() -
					new Date(a.updatedAt ?? 0).getTime()
				);
			return (b.stars ?? -1) - (a.stars ?? -1);
		});
		return sorted;
	}, [catalog, filter, sort, category, superwowOnly]);

	const counts = useMemo(() => {
		const c: Partial<Record<CategoryFilter, number>> = { all: catalog?.length ?? 0 };
		for (const a of catalog ?? []) c[a.category] = (c[a.category] ?? 0) + 1;
		return c;
	}, [catalog]);

	const superwowCount = useMemo(
		() => (catalog ?? []).filter(a => !!a.superwow).length,
		[catalog]
	);

	return (
		<div className="tw-surface flex min-h-0 flex-grow flex-col gap-3">
			<div className="flex items-center justify-between gap-3">
				<h4 className="tw-color">{t('discover.title')}</h4>
				<div className="flex items-center gap-1 border-b border-blueGray bg-darkGray/70 p-1 hocus:border-orange">
					<input
						className="cursor-text bg-inherit"
						placeholder={t('discover.searchPlaceholder')}
						value={filter}
						onChange={e => setFilter(e.target.value)}
					/>
					<Search size={16} className="text-blueGray" />
				</div>
			</div>
			<div className="flex items-center gap-3">
				<span className="s1 text-blueGray">{t('discover.sortBy')}</span>
				{(['popular', 'recent', 'name'] as const).map(mode => (
					<TextButton
						key={mode}
						onClick={() => setSort(mode)}
						active={sort === mode}
						className="s1"
					>
						{t(`discover.sort.${mode}`)}
					</TextButton>
				))}
				<span className="s1 ml-auto text-blueGray/60">
					{t('discover.count', { count: items.length })}
				</span>
			</div>
			<div className="flex flex-wrap items-center gap-1">
					{(['all', ...ADDON_CATEGORIES] as const).map(cat => (
						<TextButton
							key={cat}
							onClick={() => setCategory(cat)}
							active={category === cat}
							className={cls(
								's1 border border-blueGray/20 !px-2 !py-0.5',
								category === cat && 'border-orange bg-orange/10'
							)}
						>
							{t(`discover.category.${cat}`)}
							{counts[cat] ? (
								<span className="ml-1 text-blueGray/50">{counts[cat]}</span>
							) : null}
						</TextButton>
					))}
					{superwowCount > 0 && (
						<TextButton
							onClick={() => setSuperwowOnly(v => !v)}
							active={superwowOnly}
							className={cls(
								's1 border border-blueGray/20 !px-2 !py-0.5',
								superwowOnly && 'border-orange bg-orange/10'
							)}
						>
							{t('discover.superwowFilter')}
							<span className="ml-1 text-blueGray/50">{superwowCount}</span>
						</TextButton>
					)}
				</div>
				<hr />
			<div
				ref={scrollRef}
				className="relative -m-4 -mt-3 grid flex-grow auto-rows-min grid-cols-2 content-start gap-3 overflow-y-auto p-4 pt-3 xl:grid-cols-3"
			>
				{!catalog && (
					<div className="col-span-full flex justify-center py-6">
						<IconSpinner size={24} className="text-blueGray" />
					</div>
				)}
				{catalog &&
					items.map(a => {
						const isInstalled = installed.has(a.name);
						const ago = timeAgo(a.updatedAt);
						const rowStatus = addonsStatus.addons[a.name];
						const isDownloading = rowStatus?.status === 'downloading';
						return (
							<div
								key={a.name}
								className="flex flex-col gap-2 border border-blueGray/20 bg-darkerGray/60 p-3"
							>
								<div className="flex items-start justify-between gap-2">
									<p className="s1 font-bold text-warmGreen">{a.name}</p>
									<TextButton
										icon={ExternalLink}
										size={14}
										onClick={() =>
											openLink.mutateAsync(a.git.replace(/\.git$/, ''))
										}
										className="!p-0 text-blueGray/60 hocus:text-pink"
									/>
								</div>
								<p className="s1 min-h-[40px] text-blueGray">
									{a.description || t('discover.noDescription')}
								</p>
								{(a.superwow || a.relatedMods.length > 0) && (
									<div className="flex flex-wrap gap-1">
										{a.superwow && (
											<span
												className={cls(
													's1 border px-1',
													a.superwow === 'requires'
														? 'border-orange/40 text-orange'
														: 'border-blueGray/40 text-blueGray'
												)}
											>
												{t(
													a.superwow === 'requires'
														? 'discover.superwowRequires'
														: 'discover.superwowEnhanced'
												)}
											</span>
										)}
										{a.relatedMods.map(mod => (
											<span
												key={mod}
												className="s1 border border-blueGray/40 px-1 text-blueGray"
											>
												{t('discover.relatedMod', { mod })}
											</span>
										))}
									</div>
								)}
								<div className="flex items-center gap-3">
									{a.stars != null && (
										<span className="s1 flex items-center gap-1 text-yellow">
											<Star size={12} className="fill-current" />
											{a.stars}
										</span>
									)}
									{ago && (
										<span className="s1 text-blueGray/60">
											{t('discover.updated', {
												ago: t(
													ago.key,
													'n' in ago ? { n: ago.n } : undefined
												)
											})}
										</span>
									)}
								</div>
								<div className="mt-1 flex justify-end">
									{isDownloading ? (
										<IconSpinner size={16} className="text-blueGray" />
									) : isInstalled ? (
										<span className="s1 flex items-center gap-1 text-warmGreen">
											<Check size={14} />
											{t('discover.installed')}
										</span>
									) : (
										<TextButton
											icon={DownloadCloud}
											onClick={() =>
												update.mutateAsync({ toUpdate: [a.name] })
											}
											className={cls('s1 text-warmGreen')}
										>
											{t('discover.install')}
										</TextButton>
									)}
								</div>
							</div>
						);
					})}
			</div>
		</div>
	);
};

export default DiscoverTab;
