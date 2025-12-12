import React from 'react';
import {
    Box, List, ListItemButton, ListItemText, Stack, Typography,
    useTheme, useMediaQuery, IconButton, Divider, Button, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    FormControlLabel, Checkbox, ToggleButton, ToggleButtonGroup, Badge,
    Menu, MenuItem, ListItemIcon, ListItemText as MListItemText, CardMedia
} from '@mui/material';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import CloseFullscreenRounded from '@mui/icons-material/CloseFullscreenRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import FilterAltOffRounded from '@mui/icons-material/FilterAltOffRounded';
import SortRounded from '@mui/icons-material/SortRounded';
import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded';
import SortByAlphaRounded from '@mui/icons-material/SortByAlphaRounded';
import PriorityHighRounded from '@mui/icons-material/PriorityHighRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import CircularProgress from '@mui/material/CircularProgress';

import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { DateTime } from 'luxon';

import { api } from '@/lib/api';
import { useAlertsInfinite } from '@/lib/useAlertsInfinite';

import type { ServerAlert } from '@/lib/types';
import { mapServerAlertToLogEvent } from '@/lib/types';

import { keyframes } from '@mui/system';

// 타입
export type LogEvent = {
    id: string;
    title: string;
    timestamp: string;              // ISO string (UTC)
    severity: 'info' | 'warn' | 'danger';
    filename?: string;
    site?: string;
    model?: string;
    sensor_id?: string;
};

type LogPlayerCardProps = {
    site: string;
    defaultStream?: string; // 플레이어가 나타난 후에만 fallback
    pollMs?: number;        // 헤드 폴링 간격(ms) - 기본 10초
};

type FilterState = {
    keyword: string;
    severities: Array<LogEvent['severity']>;
    from: DateTime | null;
    to: DateTime | null;
    hasVideoOnly: boolean;
};

type SortKey = 'timestamp' | 'title' | 'severity';
type SortDir = 'asc' | 'desc';

// 유틸/상수
const initialFilter: FilterState = {
    keyword: '',
    severities: [],
    from: null,
    to: null,
    hasVideoOnly: false,
};

const severityRank: Record<LogEvent['severity'], number> = { danger: 3, warn: 2, info: 1 };

function compareBy(key: SortKey, dir: SortDir) {
    const m = dir === 'asc' ? 1 : -1;
    return (a: LogEvent, b: LogEvent) => {
        if (key === 'timestamp') {
            const ta = DateTime.fromISO(a.timestamp).toMillis() || 0;
            const tb = DateTime.fromISO(b.timestamp).toMillis() || 0;
            if (ta === tb) return 0;
            return (ta - tb) * m;
        }
        if (key === 'title') {
            const aa = a.title.toLowerCase();
            const bb = b.title.toLowerCase();
            if (aa === bb) return 0;
            return (aa < bb ? -1 : 1) * m;
        }
        const sa = severityRank[a.severity] || 0;
        const sb = severityRank[b.severity] || 0;
        if (sa === sb) return 0;
        return (sa - sb) * m;
    };
}

// 목록 앞에 새 데이터 붙이고 스크롤 위치 보전
function prependAndPreserveScroll(
    container: HTMLDivElement,
    newItems: LogEvent[],
    setEvents: React.Dispatch<React.SetStateAction<LogEvent[]>>
) {
    if (!newItems.length) return;
    const prevScrollTop = container.scrollTop;
    const prevScrollHeight = container.scrollHeight;

    setEvents(prev => {
        const prevIds = new Set(prev.map(x => x.id));
        const uniqNew = newItems.filter(x => !prevIds.has(x.id));
        if (!uniqNew.length) return prev;
        return [...uniqNew, ...prev];
    });

    requestAnimationFrame(() => {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
    });
}

// 서버에서 최신분만 가져오기 (API 스키마/파라미터는 환경에 맞게 조정)
async function fetchHeadNewItems({
    site,
    sinceIso,
    filter,
}: {
    site: string;
    sinceIso?: string;   // 마지막 폴링 시각
    filter: FilterState;
}): Promise<LogEvent[]> {
    if (!sinceIso) return [];

    const params: any = {
        site,
        order: 'desc',
        limit: 20,
        since: sinceIso,
    };

    if (filter.keyword) params.keyword = filter.keyword;
    if (filter.severities?.length) params.severities = filter.severities.join(',');
    if (filter.hasVideoOnly) params.hasVideoOnly = true;
    if (filter.from) params.from = filter.from.toUTC().toISO();
    if (filter.to) params.to = filter.to.toUTC().toISO();

    const { data } = await api.get('data/log/alert', {
        params,
        withCredentials: true,
    });
    const items: ServerAlert[] = Array.isArray(data?.alerts) ? data.alerts : [];
    const mapped = items.map(mapServerAlertToLogEvent);

    return mapped
}

const SEVERITY_META = {
    info: { text: 'INFO', color: 'default' as const, icon: <PlayArrowRounded /> },
    warn: { text: 'WARN', color: 'warning' as const, icon: <PlayArrowRounded /> },
    danger: { text: 'DANGER', color: 'error' as const, icon: <ErrorOutlineRounded /> },
};

type PillSize = 'sm' | 'md';

const SeverityPill: React.FC<{ sev: 'info' | 'warn' | 'danger'; size?: PillSize; hasVideo?: boolean }> = ({
    sev,
    size = 'sm',
    hasVideo = false,
}) => {
    const theme = useTheme();
    const meta = SEVERITY_META[sev];

    const H = size === 'sm' ? 26 : 30;
    const W = size === 'sm' ? 80 : 110;
    const FS = size === 'sm' ? 14 : 13;
    const IS = size === 'sm' ? 20 : 24;
    const PAD = size === 'sm' ? '6px' : '8px';

    const bg =
        meta.color === 'error' ? theme.palette.error.main
            : meta.color === 'warning' ? theme.palette.warning.main
                : theme.palette.action.selected;

    const fg =
        meta.color === 'error' || meta.color === 'warning'
            ? theme.palette.getContrastText(bg)
            : theme.palette.text.primary;

    const iconNode = hasVideo ? <PlayArrowRounded /> : <ErrorOutlineRounded />;

    return (
        <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title={hasVideo ? '영상 재생 가능' : '영상 없음'}>
                <Box sx={{ display: 'grid', placeItems: 'center', mr: 0.5, '& .MuiSvgIcon-root': { fontSize: IS }, opacity: hasVideo ? 1 : 0.65 }}>
                    {iconNode}
                </Box>
            </Tooltip>
            <Box
                sx={{
                    width: W, height: H, borderRadius: 999,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    gap: 0.5, px: PAD, bgcolor: bg, color: fg, userSelect: 'none', lineHeight: 1,
                }}
            >
                <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                    <Typography component="span" sx={{ fontSize: FS, fontWeight: 600, letterSpacing: 0.2 }}>
                        {meta.text}
                    </Typography>
                </Box>
            </Box>
        </Stack>
    );
};

// 정렬 드롭다운
function SortMenu({
    sortKey, sortDir, onChange
}: {
    sortKey: SortKey;
    sortDir: SortDir;
    onChange: (k: SortKey, d: SortDir) => void;
}) {
    const [anchor, setAnchor] = React.useState<null | HTMLElement>(null);
    const open = Boolean(anchor);
    const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => setAnchor(e.currentTarget);
    const handleClose = () => setAnchor(null);

    const label = (() => {
        if (sortKey === 'timestamp') return `날짜 · ${sortDir === 'desc' ? '최신→과거' : '과거→최신'}`;
        if (sortKey === 'title') return `제목 · ${sortDir === 'asc' ? 'A→Z' : 'Z→A'}`;
        return `위험도 · ${sortDir === 'desc' ? '높음→낮음' : '낮음→높음'}`;
    })();

    const Item = ({
        icon, primary, k, d
    }: { icon: React.ReactNode; primary: string; k: SortKey; d: SortDir }) => (
        <MenuItem
            selected={sortKey === k && sortDir === d}
            onClick={() => { onChange(k, d); handleClose(); }}
        >
            <ListItemIcon>{icon}</ListItemIcon>
            <MListItemText primary={primary} />
        </MenuItem>
    );

    return (
        <>
            <Button
                size="small"
                variant="outlined"
                startIcon={<SortRounded />}
                endIcon={<ArrowDropDownRounded />}
                onClick={handleOpen}
            >
                {label}
            </Button>
            <Menu anchorEl={anchor} open={open} onClose={handleClose}>
                <Item icon={<AccessTimeRounded />} primary="날짜 · 최신→과거" k="timestamp" d="desc" />
                {/* <Item icon={<AccessTimeRounded />} primary="날짜 · 과거→최신" k="timestamp" d="asc" /> */}
                <Divider />
                <Item icon={<SortByAlphaRounded />} primary="제목 · A→Z" k="title" d="asc" />
                <Item icon={<SortByAlphaRounded />} primary="제목 · Z→A" k="title" d="desc" />
                <Divider />
                <Item icon={<PriorityHighRounded />} primary="위험도 · 높음→낮음" k="severity" d="desc" />
                <Item icon={<PriorityHighRounded />} primary="위험도 · 낮음→높음" k="severity" d="asc" />
            </Menu>
        </>
    );
}

const flash = keyframes`
  0%   { background-color: rgba(255, 214, 102, 0.0); } /* theme.warning.light 대략 */
  25%  { background-color: rgba(255, 214, 102, 0.6); }
  50%  { background-color: rgba(255, 214, 102, 0.15); }
  75%  { background-color: rgba(255, 214, 102, 0.6); }
  100% { background-color: rgba(255, 214, 102, 0.0); }
`;

const LogPlayerCard: React.FC<LogPlayerCardProps> = ({ site, defaultStream, pollMs = 5000 }) => {
    const theme = useTheme();
    const isDownMd = useMediaQuery(theme.breakpoints.down('md'));

    // 컴포넌트 내부 최상단 근처에 추가
    const lastPollRef = React.useRef<string | null>(null);

    const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '') ?? '';

    function buildVideoUrlFromEvent(ev?: LogEvent): string | undefined {
        if (!ev) return undefined;
        if (!ev.filename) return undefined;

        const folderKey = site && ev.model && ev.sensor_id
            ? `${site}-${ev.model}-INFERENCE-${ev.sensor_id}`.toUpperCase()
            : null;

        if (!folderKey) return undefined;

        const base = (API_BASE ?? "").replace(/\/+$/, "");
        const path = `/media/video/${encodeURIComponent(folderKey)}/${encodeURIComponent(ev.filename)}`;
        return `${base}${path}`;
    }

    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [showPlayer, setShowPlayer] = React.useState(false);
    const [collapsed, setCollapsed] = React.useState(false);

    React.useEffect(() => {
        if (!isDownMd) setCollapsed(Boolean(selectedId));
    }, [selectedId, isDownMd]);

    const handleSelect = (id: string) => {
        setSelectedId(id);
        setShowPlayer(true);
    };
    const [flashIds, setFlashIds] = React.useState<Set<string>>(new Set());
    const FLASH_LIFETIME_MS = 10000; // 깜빡임 유지 후 제거

    function addFlash(ids: string[]) {
        if (!ids.length) return;
        // 즉시 표시
        setFlashIds(prev => new Set([...prev, ...ids]));
        // 일정 시간 뒤 자동 제거
        setTimeout(() => {
            setFlashIds(prev => {
                const next = new Set(prev);
                ids.forEach(id => next.delete(id));
                return next;
            });
        }, FLASH_LIFETIME_MS);
    }

    // 필터 상태 & 다이얼로그 
    const [filterOpen, setFilterOpen] = React.useState(false);
    const [filter, setFilter] = React.useState<FilterState>(initialFilter);

    const activeFilterCount = React.useMemo(() => {
        let n = 0;
        if (filter.keyword.trim()) n++;
        if (filter.severities.length > 0) n++;
        if (filter.from) n++;
        if (filter.to) n++;
        if (filter.hasVideoOnly) n++;
        return n;
    }, [filter]);

    const clearFilter = () => setFilter(initialFilter);

    // 정렬 상태 
    const [sortKey, setSortKey] = React.useState<SortKey>('timestamp');
    const [sortDir, setSortDir] = React.useState<SortDir>('desc');

    const serverOrder: 'asc' | 'desc' =
        sortKey === 'timestamp' ? sortDir : 'desc';

    const fromISO = filter.from ? filter.from.toUTC().toISO() : null;
    const toISO = filter.to ? filter.to.toUTC().toISO() : null;

    const {
        items: serverEvents,
        loading: loadingMore,
        hasMore,
        fetchNext,
        reset,
    } = useAlertsInfinite({
        site,
        pageSize: 20,
        order: serverOrder,
        from: fromISO,
        to: toISO,
        keyword: filter.keyword,
        severities: filter.severities,
        hasVideoOnly: filter.hasVideoOnly,
    });

    const [events, setEvents] = React.useState<LogEvent[]>([]);
    React.useEffect(() => {
        setEvents(serverEvents);
    }, [serverEvents]);

    // 스크롤 컨테이너 ref (모바일/데스크톱 공용)
    const listScrollRef = React.useRef<HTMLDivElement | null>(null);

    // 사용자가 "가장 위"에 있는지 추적 (배너 자동 해제 및 자동 스냅용)
    const [atTop, setAtTop] = React.useState(true);
    const TOP_THRESH = 12; // px

    // 새 항목 배너 상태 
    const [unseenCount, setUnseenCount] = React.useState(0);

    const onScrollContainer = React.useCallback(() => {
        const el = listScrollRef.current;
        if (!el) return;
        const isTop = el.scrollTop <= TOP_THRESH;
        setAtTop(isTop);
        if (isTop && !isFiltered && unseenCount > 0) {
            // 맨 위로 올라오면 배너 해제
            setUnseenCount(0);
        }
    }, [unseenCount]);

    // 무한스크롤 sentinel
    const sentinelRef = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && hasMore && !loadingMore) {
                    fetchNext();
                }
            });
        }, { root: null, rootMargin: '200px', threshold: 0 });
        io.observe(el);
        return () => io.disconnect();
    }, [hasMore, loadingMore, fetchNext]);

    // 필터 + 정렬(클라이언트측 보조 정렬)
    const filteredSortedEvents = React.useMemo(() => {
        const arr = events.filter(ev => {
            if (filter.keyword.trim()) {
                const kw = filter.keyword.trim().toLowerCase();
                if (!ev.title.toLowerCase().includes(kw)) return false;
            }
            if (filter.severities.length > 0 && !filter.severities.includes(ev.severity)) return false;

            const ts = DateTime.fromISO(ev.timestamp, { zone: 'utc' }).toMillis();
            if (filter.from && ts < filter.from.toMillis()) return false;
            if (filter.to && ts > filter.to.toMillis()) return false;

            if (filter.hasVideoOnly && !ev.filename) return false;
            return true;
        });

        if (sortKey === 'timestamp') return arr;
        return arr.sort(compareBy(sortKey, sortDir));
    }, [events, filter, sortKey, sortDir]);

    const selected = React.useMemo(
        () => filteredSortedEvents.find(e => e.id === selectedId),
        [selectedId, filteredSortedEvents]
    );

    const preferred = buildVideoUrlFromEvent(selected);
    const currentSrc = showPlayer ? (preferred ?? defaultStream) : undefined;

    // 새로고침 버튼
    const [isRefreshing, setIsRefreshing] = React.useState(false);

    const handleRefresh = React.useCallback(async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);

        setSelectedId(null);
        setShowPlayer(false);

        reset();
        await fetchNext();

        const el = listScrollRef.current;
        if (el) el.scrollTo({ top: 0, behavior: 'auto' });

        setUnseenCount(0);
        // 새 기준 시각
        lastPollRef.current = new Date().toISOString();

        setIsRefreshing(false);
    }, [isRefreshing, reset, fetchNext]);


    // site 또는 필터/정렬이 바뀌면 기준 시각을 '지금'으로 리셋
    React.useEffect(() => {
        lastPollRef.current = new Date().toISOString();
    }, [site, filter.keyword, filter.severities, filter.hasVideoOnly, fromISO, toISO, sortKey, sortDir]);




    // 필터/정렬이 바뀌거나(특히 timestamp가 아닐 때) 맨 위에 올라오면 배너 해제
    React.useEffect(() => {
        if (sortKey !== 'timestamp') setUnseenCount(0);
    }, [sortKey]);
    React.useEffect(() => {
        if (atTop && !isFiltered) setUnseenCount(0);
    }, [events, atTop]);

    const jumpToTop = React.useCallback(() => {
        clearFilter();
        const el = listScrollRef.current;
        if (!el) return;
        setUnseenCount(0);
        el.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    // 헤드 폴링: 최신 이벤트만 앞에 붙이고 스크롤 보전/스냅 
    React.useEffect(() => {
        let alive = true;
        if (!site || pollMs <= 0) return;

        const tick = async () => {
            if (!alive) return;
            try {
                if (sortKey !== 'timestamp') return; // timestamp 정렬일 때만 의미 있음
                const container = listScrollRef.current;
                if (!container) return;

                // 마지막 폴링 시각 기준
                const sinceIso = lastPollRef.current;
                if (!sinceIso) {
                    // 아직 기준이 없으면 지금 시각으로 설정하고 이번 턴은 스킵
                    lastPollRef.current = new Date().toISOString();
                    return;
                }

                const headItems = await fetchHeadNewItems({ site, sinceIso, filter });

                // 응답을 처리했으니 '커버된 구간의 끝'을 현재 시각으로 업데이트
                lastPollRef.current = new Date().toISOString();

                if (!alive || !headItems.length) return;

                // 중복 제거
                const prevIds = new Set(events.map(e => e.id));
                const uniqNew = headItems.filter(x => !prevIds.has(x.id));
                if (!uniqNew.length) return;

                if (atTop) {
                    setEvents(prev => [...uniqNew, ...prev]);
                    requestAnimationFrame(() => { container.scrollTop = 0; });
                    if (!isFiltered)
                        setUnseenCount(0);
                    else
                        setUnseenCount(c => c + uniqNew.length);
                    addFlash(uniqNew.map(it => it.id));
                } else {
                    prependAndPreserveScroll(container, uniqNew, setEvents);
                    setUnseenCount(c => c + uniqNew.length);
                    addFlash(uniqNew.map(it => it.id));
                }
            } catch {
                /* silent */
            }
        };

        const id = setInterval(tick, pollMs);
        return () => { alive = false; clearInterval(id); };
    }, [site, pollMs, sortKey, filter, events, atTop]);

    // 모바일 레이아웃
    const isMobile = isDownMd;

    const isFiltered = activeFilterCount > 0;

    // 공통: sticky 새 항목 배너 컴포넌트
    const NewBadgeBar = (
        <Box
            sx={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                display: unseenCount > 0 ? 'flex' : 'none',
                justifyContent: 'center',
                p: 1,
                bgcolor: 'background.paper',
                borderBottom: 1,
                borderColor: 'divider',
            }}
        >
            <Button size="small" variant="contained" onClick={jumpToTop}>
                새 항목 {unseenCount}개 보기
            </Button>
        </Box>
    );

    if (isMobile) {
        return (
            <LocalizationProvider dateAdapter={AdapterLuxon} adapterLocale="ko">
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {!selectedId ? (
                        <>
                            {/* 상단 바: 검색/필터 + 정렬 + 새로고침 */}
                            <Box sx={{ py: 0.5, display: 'flex', gap: 1, alignItems: 'center', justifyContent: "flex-end", mb: 0.5, flexWrap: 'wrap' }}>
                                <Button
                                    size="small"
                                    variant="contained"
                                    onClick={handleRefresh}
                                    startIcon={isRefreshing ? undefined : <RefreshRounded />}
                                    disabled={isRefreshing}
                                >
                                    {isRefreshing ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : '새로고침'}
                                </Button>

                                <Badge color="primary" badgeContent={activeFilterCount || undefined}>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<SearchRounded />}
                                        onClick={() => setFilterOpen(true)}
                                    >
                                        검색/필터
                                    </Button>
                                </Badge>

                                <SortMenu sortKey={sortKey} sortDir={sortDir} onChange={(k, d) => { setSortKey(k); setSortDir(d); }} />

                                {activeFilterCount > 0 && (
                                    <Tooltip title="필터 해제">
                                        <IconButton size="small" onClick={clearFilter}>
                                            <FilterAltOffRounded />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Box>

                            <Box
                                ref={listScrollRef}
                                onScroll={onScrollContainer}
                                sx={{
                                    border: 1, borderColor: 'divider', borderRadius: 1,
                                    overflow: 'hidden', height: '56vh', bgcolor: 'background.paper',
                                    display: 'flex', flexDirection: 'column'
                                }}
                            >
                                {NewBadgeBar}
                                <List dense disablePadding sx={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                    {filteredSortedEvents.length === 0 && (
                                        <Box sx={{ p: 2 }}>
                                            <Typography variant="body2" color="text.secondary">조건에 맞는 이벤트가 없습니다.</Typography>
                                        </Box>
                                    )}
                                    {filteredSortedEvents.map(ev => (
                                        <ListItemButton key={ev.id} onClick={() => handleSelect(ev.id)} sx={{
                                            alignItems: 'flex-start', py: 1.25, ...(flashIds.has(ev.id) && {
                                                animation: `${flash} 1.2s ease-in-out 8`, // 1.2초 * 8회 = 약 9.6초
                                                borderRadius: 1,
                                            })
                                        }}>
                                            <Box sx={{ mr: 1, mt: 1.5, display: 'flex', alignItems: 'center' }}>
                                                <SeverityPill sev={ev.severity} size="sm" hasVideo={Boolean(ev.filename)} />
                                            </Box>
                                            <ListItemText
                                                primary={ev.title}
                                                secondary={
                                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                                        <AccessTimeRounded fontSize="inherit" />
                                                        <Typography variant="caption" color="text.secondary">
                                                            {DateTime.fromISO(ev.timestamp, { zone: "utc" }).setZone('Asia/Seoul').toFormat("yy년 MM월 dd일 a hh:mm:ss")}
                                                        </Typography>
                                                    </Stack>
                                                }
                                                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                                                secondaryTypographyProps={{ component: 'div' }}
                                            />
                                        </ListItemButton>
                                    ))}

                                    {/* sentinel & 상태 표시 */}
                                    <Box ref={sentinelRef} sx={{ p: 2, textAlign: 'center' }} />
                                </List>
                            </Box>
                        </>
                    ) : (
                        <Box
                            sx={{
                                position: 'relative',
                                border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden',
                                height: '64vh'
                            }}
                        >
                            <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                <Button
                                    size="small"
                                    startIcon={<ChevronLeftRounded />}
                                    onClick={() => setSelectedId(null)}
                                    variant="contained"
                                >
                                    목록
                                </Button>
                            </Box>
                            {!currentSrc && showPlayer && (
                                <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', px: 2 }}>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ whiteSpace: 'pre-line' }}
                                    >
                                        저장된 비디오 파일이 없습니다.
                                    </Typography>
                                </Box>
                            )}
                            {showPlayer && currentSrc && (
                                <CardMedia
                                    component="video"
                                    src={currentSrc}
                                    controls
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                    style={{ height: "100%" }}
                                />
                            )}
                        </Box>
                    )}

                    {/* 필터 다이얼로그 */}
                    <FilterDialog
                        open={filterOpen}
                        onClose={() => setFilterOpen(false)}
                        filter={filter}
                        setFilter={setFilter}
                        clearFilter={clearFilter}
                    />
                </Box>
            </LocalizationProvider>
        );
    }

    // 데스크톱 레이아웃
    const leftBasis = showPlayer ? (collapsed ? '45%' : '100%') : '100%';
    const rightHidden = !showPlayer;

    return (
        <LocalizationProvider dateAdapter={AdapterLuxon} adapterLocale="ko">
            <Box sx={{ display: 'flex', gap: 2, height: '100%', minHeight: 0, alignItems: 'stretch' }}>
                {/* 왼쪽 패널 (목록) */}
                <Box
                    sx={{
                        flex: '0 0 auto',
                        flexBasis: leftBasis,
                        minWidth: 280,
                        transition: theme.transitions.create('flex-basis', { duration: 250, easing: theme.transitions.easing.easeInOut }),
                        display: 'flex', flexDirection: 'column',
                        borderRadius: 1, border: 1, borderColor: 'divider',
                        overflow: 'hidden', bgcolor: 'background.paper'
                    }}
                >
                    <Box sx={{ px: 1, py: 1, display: 'flex', alignItems: 'center', justifyContent: "flex-end", gap: 1, flexWrap: 'wrap' }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                            <Button
                                size="small"
                                variant="contained"
                                onClick={handleRefresh}
                                startIcon={isRefreshing ? undefined : <RefreshRounded />}
                                disabled={isRefreshing}
                            >
                                {isRefreshing ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : '새로고침'}
                            </Button>

                            <SortMenu sortKey={sortKey} sortDir={sortDir} onChange={(k, d) => { setSortKey(k); setSortDir(d); }} />

                            <Badge color="primary" badgeContent={activeFilterCount || undefined}>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<SearchRounded />}
                                    onClick={() => setFilterOpen(true)}
                                >
                                    검색/필터
                                </Button>
                            </Badge>

                            <Tooltip title="필터 해제">
                                <span>
                                    <IconButton size="small" onClick={clearFilter} disabled={activeFilterCount === 0}>
                                        <FilterAltOffRounded />
                                    </IconButton>
                                </span>
                            </Tooltip>

                            {showPlayer && (
                                <Tooltip title={collapsed ? '목록 확장' : '목록 축소'}>
                                    <IconButton size="small" onClick={() => setCollapsed(v => !v)}>
                                        {collapsed ? <OpenInFullRounded fontSize="small" /> : <CloseFullscreenRounded fontSize="small" />}
                                    </IconButton>
                                </Tooltip>
                            )}
                        </Stack>
                    </Box>

                    <Divider />
                    <Box
                        ref={listScrollRef}
                        onScroll={onScrollContainer}
                        sx={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column' }}
                    >
                        {NewBadgeBar}
                        <List dense disablePadding>
                            {filteredSortedEvents.length === 0 && (
                                <Box sx={{ p: 2 }}>
                                    <Typography variant="body2" color="text.secondary">조건에 맞는 이벤트가 없습니다.</Typography>
                                </Box>
                            )}
                            {filteredSortedEvents.map(ev => (
                                <ListItemButton
                                    key={ev.id}
                                    selected={ev.id === selectedId}
                                    onClick={() => handleSelect(ev.id)}
                                    sx={{
                                        alignItems: 'flex-start', py: 1.25, ...(flashIds.has(ev.id) && {
                                            animation: `${flash} 1.2s ease-in-out 8`, // 1.2초 * 8회 = 약 9.6초
                                            borderRadius: 1,
                                        })
                                    }}>
                                    <Box sx={{ mr: 1, mt: 1.5, display: 'flex', alignItems: 'center' }}>
                                        <SeverityPill sev={ev.severity} size="sm" hasVideo={Boolean(ev.filename)} />
                                    </Box>
                                    <ListItemText
                                        primary={ev.title}
                                        secondary={
                                            <Stack direction="row" spacing={0.5} alignItems="center">
                                                <AccessTimeRounded fontSize="inherit" />
                                                <Typography variant="caption" color="text.secondary">
                                                    {DateTime.fromISO(ev.timestamp, { zone: "utc" }).setZone('Asia/Seoul').toFormat("yy년 MM월 dd일 a hh:mm:ss")}
                                                </Typography>
                                            </Stack>
                                        }
                                        primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                                        secondaryTypographyProps={{ component: 'div' }}
                                    />
                                </ListItemButton>
                            ))}
                            {/* sentinel */}
                            <Box ref={sentinelRef} sx={{ p: 2, textAlign: 'center' }} />
                        </List>
                    </Box>
                </Box>

                {/* 오른쪽 패널 (비디오) */}
                <Box
                    sx={{
                        flex: rightHidden ? '0 0 0px' : '1 1 0%',
                        minWidth: 0,
                        borderRadius: 1,
                        border: 1,
                        borderColor: rightHidden ? 'transparent' : 'divider',
                        overflow: 'hidden',
                        position: 'relative',
                        opacity: rightHidden ? 0 : 1,
                        pointerEvents: rightHidden ? 'none' : 'auto',
                        transition: theme.transitions.create(['flex', 'opacity', 'border-color'],
                            { duration: 250, easing: theme.transitions.easing.easeInOut })
                    }}
                >
                    {!currentSrc && showPlayer && (
                        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', px: 2 }}>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ whiteSpace: 'pre-line' }}
                            >
                                저장된 비디오 파일이 없습니다.
                            </Typography>
                        </Box>
                    )}
                    {showPlayer && currentSrc && (
                        <CardMedia
                            component="video"
                            src={currentSrc}
                            controls
                            autoPlay
                            loop
                            muted
                            playsInline
                            style={{ height: "100%" }}
                        />
                    )}
                </Box>
            </Box>

            {/* 필터 다이얼로그 */}
            <FilterDialog
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                filter={filter}
                setFilter={setFilter}
                clearFilter={clearFilter}
            />
        </LocalizationProvider>
    );
};

// 필터 다이얼로그
function FilterDialog({
    open, onClose, filter, setFilter, clearFilter
}: {
    open: boolean;
    onClose: () => void;
    filter: FilterState;
    setFilter: React.Dispatch<React.SetStateAction<FilterState>>;
    clearFilter: () => void;
}) {
    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>검색 및 필터</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <TextField
                        label="키워드(제목)"
                        value={filter.keyword}
                        onChange={(e) => setFilter(f => ({ ...f, keyword: e.target.value }))}
                        placeholder="예: 가스, 연기, 쓰러짐..."
                        size="small"
                    />
                    <Box>
                        <Typography variant="caption" color="text.secondary">심각도</Typography>
                        <ToggleButtonGroup
                            size="small"
                            value={filter.severities}
                            onChange={(_, v) => setFilter(f => ({ ...f, severities: v }))}
                            aria-label="severity filter"
                            sx={{ pl: 1 }}
                        >
                            <ToggleButton value="info" aria-label="info">INFO</ToggleButton>
                            <ToggleButton value="warn" aria-label="warn">WARN</ToggleButton>
                            <ToggleButton value="danger" aria-label="danger">DANGER</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                    <LocalizationProvider dateAdapter={AdapterLuxon}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <DateTimePicker
                                label="시작(From)"
                                value={filter.from}
                                onChange={(v) => setFilter(f => ({ ...f, from: v }))}
                                slotProps={{ textField: { size: 'small', fullWidth: true } }}
                            />
                            <DateTimePicker
                                label="종료(To)"
                                value={filter.to}
                                onChange={(v) => setFilter(f => ({ ...f, to: v }))}
                                slotProps={{ textField: { size: 'small', fullWidth: true } }}
                            />
                        </Stack>
                    </LocalizationProvider>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={filter.hasVideoOnly}
                                onChange={(e) => setFilter(f => ({ ...f, hasVideoOnly: e.target.checked }))}
                                size="small"
                            />
                        }
                        label="영상 있는 이벤트만"
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={clearFilter} color="inherit" startIcon={<FilterAltOffRounded />}>필터 해제</Button>
                <Button onClick={onClose} variant="contained">적용</Button>
            </DialogActions>
        </Dialog>
    );
}

export default LogPlayerCard;
