import React, { useEffect, useRef, useState } from 'react';
import {
    Box,
    Typography,
    ToggleButton,
    ToggleButtonGroup,
    useMediaQuery,
    Stack,
    Tooltip,
    IconButton,
    CircularProgress,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Hls from 'hls.js';
import { isCellularLike } from '@/lib/net';

// ---- Types ----
export type StreamItem = { url: string; title?: string };
type HLSPlayerProps = { src: string };
type VideoGridProps = { streams: StreamItem[] };

// ---- Helpers ----
function isIosSafari() {
    const ua = navigator.userAgent;
    return /iPhone|iPad|iPod/i.test(ua) && /^((?!chrome|android).)*safari/i.test(ua);
}
function isVisible() {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
}

// ---- HLS Player ----
const HLSPlayer: React.FC<HLSPlayerProps> = ({ src }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);

    const [error, setError] = useState(false);
    const [_isReady, setIsReady] = useState(false);
    const [showLoading, setShowLoading] = useState(false);

    // spinner
    const showT = useRef<number | null>(null);
    const hideT = useRef<number | null>(null);
    const setSpinner = (on: boolean) => {
        if (showT.current) { clearTimeout(showT.current); showT.current = null; }
        if (hideT.current) { clearTimeout(hideT.current); hideT.current = null; }
        if (on) {
            showT.current = window.setTimeout(() => setShowLoading(true), 300) as any;
        } else {
            hideT.current = window.setTimeout(() => setShowLoading(false), 120) as any;
        }
    };

    // 진행 상황 추적 (워치독용)
    const lastTimeRef = useRef(0);
    const lastUpdateRef = useRef<number>(Date.now());

    // ---- helpers ----
    const tinySeek = (v: HTMLVideoElement) => {
        try { v.currentTime = v.currentTime + 0.001; } catch { }
    };

    const jumpToLiveEdge = (v: HTMLVideoElement, h?: Hls | null, pad = 0.8) => {
        const lp = (h as any)?.liveSyncPosition;
        if (Number.isFinite(lp)) {
            try {
                v.currentTime = lp as number;
                return;
            } catch { }
        }
        try {
            const s = v.seekable;
            if (s && s.length) {
                const end = s.end(s.length - 1);
                v.currentTime = Math.max(0, end - pad);
            }
        } catch { }
    };

    const destroyHls = () => {
        if (hlsRef.current) {
            try { hlsRef.current.destroy(); } catch { }
            hlsRef.current = null;
        }
    };

    const softReload = () => {
        const v = videoRef.current;
        const h = hlsRef.current;
        if (!v || !h) return;

        setSpinner(true);
        try { h.stopLoad(); } catch { }
        try { h.startLoad(-1); } catch { }
        jumpToLiveEdge(v, h, 1.0);
        tinySeek(v);
        try { v.play(); } catch { }
    };

    const hardReconnect = ({ silent = false }: { silent?: boolean } = {}) => {
        const v = videoRef.current;
        setError(false);
        if (!silent) setSpinner(true);

        destroyHls();
        if (v) {
            detachVideoEvents(v);
            v.removeAttribute('src');
            try { v.load?.(); } catch { }
        }
        setup();
    };

    // ---- video events ----
    const onPlaying = () => {
        const v = videoRef.current;
        if (v) {
            lastTimeRef.current = v.currentTime;
            lastUpdateRef.current = Date.now();
        }
        setSpinner(false);
        setIsReady(true);
        setError(false);
    };

    const onLoadedData = () => {
        const v = videoRef.current;
        if (v) {
            lastTimeRef.current = v.currentTime;
            lastUpdateRef.current = Date.now();
        }
        setSpinner(false);
        setIsReady(true);
    };

    const onWaiting = () => {
        setSpinner(true);
        const v = videoRef.current;
        if (v) tinySeek(v);
    };

    const onTimeUpdate = () => {
        const v = videoRef.current;
        if (!v) return;
        const t = v.currentTime;
        if (t !== lastTimeRef.current) {
            lastTimeRef.current = t;
            lastUpdateRef.current = Date.now();
        }
    };

    const onVideoError = () => {
        setSpinner(true);
        setError(true);
        const v = videoRef.current;
        const h = hlsRef.current;
        if (v && h) {
            softReload();
        } else {
            hardReconnect({ silent: false });
        }
    };

    const attachVideoEvents = (v: HTMLVideoElement) => {
        v.addEventListener('playing', onPlaying);
        v.addEventListener('loadeddata', onLoadedData);
        v.addEventListener('waiting', onWaiting);
        v.addEventListener('stalled', onWaiting);
        v.addEventListener('emptied', onWaiting);
        v.addEventListener('timeupdate', onTimeUpdate);
        v.addEventListener('error', onVideoError);
    };

    const detachVideoEvents = (v: HTMLVideoElement) => {
        v.removeEventListener('playing', onPlaying);
        v.removeEventListener('loadeddata', onLoadedData);
        v.removeEventListener('waiting', onWaiting);
        v.removeEventListener('stalled', onWaiting);
        v.removeEventListener('emptied', onWaiting);
        v.removeEventListener('timeupdate', onTimeUpdate);
        v.removeEventListener('error', onVideoError);
    };

    // ---- HLS setup ----
    const setup = () => {
        const v = videoRef.current;
        if (!v) return;

        detachVideoEvents(v);

        if (!src || !src.trim()) {
            setError(true);
            return;
        }

        setSpinner(true);
        setError(false);
        setIsReady(false);

        // iOS Safari native HLS
        if (isIosSafari() && v.canPlayType('application/vnd.apple.mpegurl')) {
            attachVideoEvents(v);
            if (v.src !== src) v.src = src;
            try { v.play().catch(() => { }); } catch { }
            return;
        }

        // hls.js
        if (Hls.isSupported()) {
            const h = new Hls({
                enableWorker: true,
                lowLatencyMode: !isCellularLike(),
                liveSyncDuration: isCellularLike() ? 2.0 : 1.2,
                liveMaxLatencyDuration: isCellularLike() ? 6.0 : 3.6,
                maxLiveSyncPlaybackRate: 1.0,
                capLevelToPlayerSize: true,
                backBufferLength: 0,
                initialLiveManifestSize: 1,
                startLevel: 0,
                fragLoadingMaxRetry: 4,
                levelLoadingMaxRetry: 4,
                manifestLoadingMaxRetry: 3,
                fragLoadingRetryDelay: 700,
                levelLoadingRetryDelay: 700,
                manifestLoadingRetryDelay: 700,
            });

            hlsRef.current = h;

            attachVideoEvents(v);
            h.attachMedia(v);
            h.loadSource(src);

            h.on(Hls.Events.MEDIA_ATTACHED, () => {
                try { h.startLoad(-1); } catch { }
            });

            v.addEventListener('loadedmetadata', function onLoadedMetadata() {
                jumpToLiveEdge(v, h, 0.8);
                tinySeek(v);
                try { v.play().catch(() => { }); } catch { }
                v.removeEventListener('loadedmetadata', onLoadedMetadata);
            });

            h.on(Hls.Events.LEVEL_LOADED, (_e, data) => {
                if (data?.details?.live) {
                    const anchor = (h as any)?.liveSyncPosition;
                    if (Number.isFinite(anchor) && (anchor - v.currentTime) > 1.2) {
                        jumpToLiveEdge(v, h, 0.8);
                        tinySeek(v);
                    }
                }
            });

            h.on(Hls.Events.FRAG_BUFFERED, () => {
                setIsReady(true);
                setSpinner(false);
                lastUpdateRef.current = Date.now();
            });

            h.on(Hls.Events.ERROR, (_e, data) => {
                if (!data) return;

                // 1) HTTP 응답 코드가 잡히는 경우 (manifest/frag 요청)
                const code = (data as any)?.response?.code;

                // ✅ 404 = 스트림/경로 없음 → 재연결 루프 중단
                if (code === 404) {
                    console.warn('[HLS] 404 Not Found. Stop reconnect loop:', src);
                    setError(true);
                    setSpinner(false);

                    // 더 이상 쓸모 없는 로더/리스너 정리
                    try { h.stopLoad(); } catch { }
                    destroyHls();            // hlsRef.current.destroy() + null 처리 (너가 만든 함수)
                    return;
                }

                // 2) fatal이 아닌 경우: 기존처럼 가볍게 재시도
                if (!data.fatal) {
                    setSpinner(true);
                    try { h.startLoad(-1); } catch { }
                    tinySeek(v);
                    return;
                }

                // 3) fatal인데 404는 아닌 경우: 기존처럼 재연결
                console.warn('[HLS] fatal error. Reconnect:', data);
                hardReconnect({ silent: false });
            });

            try { v.play().catch(() => { }); } catch { }
        } else {
            setError(true);
            setSpinner(false);
        }
    };

    // src 변경 시 초기화
    useEffect(() => {
        setup();
        return () => {
            if (showT.current) clearTimeout(showT.current);
            if (hideT.current) clearTimeout(hideT.current);

            const v = videoRef.current;
            if (v) detachVideoEvents(v);

            destroyHls();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    // ---- visibility / focus: 복귀 시 즉시 복구 ----
    useEffect(() => {
        const tryResume = () => {
            const v = videoRef.current;
            const h = hlsRef.current;
            if (!v) return;
            if (!isVisible()) return;

            // 이미 잘 재생 중이면 패스
            if (!v.paused && v.readyState >= 2) {
                lastUpdateRef.current = Date.now();
                return;
            }

            setSpinner(true);
            setError(false);
            lastUpdateRef.current = Date.now();

            // Hls 인스턴스가 있으면 우선 부드럽게 재시도
            if (h) {
                try { h.startLoad(-1); } catch { }
                jumpToLiveEdge(v, h, 1.0);
                tinySeek(v);
                try { v.play().catch(() => { }); } catch { }
            } else {
                // 없으면 바로 새로 붙이기
                hardReconnect({ silent: false });
                return;
            }

            const start = v.currentTime;

            // 1초 안에 여전히 멈춰 있으면 강제로 재연결
            setTimeout(() => {
                const stillDead =
                    isVisible() &&
                    (v.paused || v.readyState < 2 || v.currentTime <= start + 0.02);

                if (stillDead) {
                    hardReconnect({ silent: false });
                } else {
                    lastUpdateRef.current = Date.now();
                    setSpinner(false);
                }
            }, 1000);
        };

        const onVisibility = () => {
            if (isVisible()) tryResume();
        };
        const onFocus = () => {
            if (isVisible()) tryResume();
        };
        const onPageShow = () => {
            if (isVisible()) tryResume();
        };

        document.addEventListener('visibilitychange', onVisibility, { passive: true });
        window.addEventListener('focus', onFocus, { passive: true });
        window.addEventListener('pageshow', onPageShow, { passive: true });

        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('pageshow', onPageShow);
        };
    }, []);

    // ---- 워치독: visible일 때만, 백업용 ----
    useEffect(() => {
        const interval = window.setInterval(() => {
            const v = videoRef.current;
            if (!v) return;
            if (!isVisible()) return;

            const now = Date.now();
            const idleMs = now - lastUpdateRef.current;

            if (idleMs > 8000 && idleMs <= 16000) {
                softReload();
            } else if (idleMs > 16000) {
                hardReconnect({ silent: true });
            }
        }, 4000);

        return () => {
            window.clearInterval(interval);
        };
    }, []);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                crossOrigin="anonymous"
                preload="metadata"
                disablePictureInPicture
                controls={false}
                controlsList="nodownload noplaybackrate nofullscreen"
                // @ts-ignore
                webkit-playsinline="true"
                style={{ width: '100%', height: '100%', objectFit: 'fill' }}
            />
            {showLoading && !error && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: 'rgba(0,0,0,0.35)',
                    }}
                >
                    <CircularProgress />
                </Box>
            )}
            {error && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: 'rgba(0,0,0,0.8)',
                        color: '#fff',
                    }}
                >
                    <Typography variant="body2">스트림 오류 — 재연결 중…</Typography>
                </Box>
            )}
        </div>
    );
};


// ---- 모바일 전용 캐러셀 ----
function MobileCarousel({ streams }: { streams: StreamItem[] }) {
    const cellular = isCellularLike();
    const SLOTS = cellular ? 4 : 4;
    const [page, setPage] = React.useState(0);
    const totalPages = Math.max(1, Math.ceil(streams.length / SLOTS));

    const start = page * SLOTS;
    const pageStreams = streams.slice(start, start + SLOTS);
    const padded: (StreamItem | null)[] = [...pageStreams];
    while (padded.length < SLOTS) padded.push(null);

    const touch = React.useRef<{ x?: number }>({});
    const onTouchStart = (e: React.TouchEvent) => { touch.current.x = e.touches[0].clientX; };
    const onTouchEnd = (e: React.TouchEvent) => {
        const x0 = touch.current.x;
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0;
        const THRESH = 40;
        if (dx > THRESH && page > 0) setPage(page - 1);
        else if (dx < -THRESH && page < totalPages - 1) setPage(page + 1);
        touch.current.x = undefined;
    };

    const goPrev = () => setPage((p) => Math.max(0, p - 1));
    const goNext = () => setPage((p) => Math.min(totalPages - 1, p + 1));
    const goto = (idx: number) => setPage(idx);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mb: 1, px: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <IconButton onClick={goPrev} disabled={page === 0}><ChevronLeftIcon /></IconButton>
                    <IconButton onClick={goNext} disabled={page === totalPages - 1}><ChevronRightIcon /></IconButton>
                </Stack>
            </Box>

            <Box
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 0.75, px: 1, pb: 1 }}
            >
                {padded.map((stream, i) => {
                    const globalIdx = start + i;
                    const validUrl = !!(stream?.url && typeof stream.url === 'string' && stream.url.trim());
                    return (
                        <Box
                            key={stream?.url ?? `empty-${globalIdx}`}
                            sx={{
                                position: 'relative',
                                backgroundColor: '#000',
                                borderRadius: 1,
                                overflow: 'hidden',
                                flex: 1,
                                minHeight: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {stream && validUrl ? (
                                <>
                                    <HLSPlayer src={stream.url} />
                                    <Typography
                                        variant="subtitle2"
                                        sx={{
                                            position: 'absolute',
                                            top: 8,
                                            right: 8,
                                            backgroundColor: 'rgba(0,0,0,0.7)',
                                            color: '#fff',
                                            px: 1,
                                            py: 0.5,
                                            borderRadius: 1,
                                            fontSize: '0.875rem',
                                            zIndex: 1,
                                        }}
                                    >
                                        {stream.title ?? `Stream ${globalIdx + 1}`}
                                    </Typography>
                                </>
                            ) : (
                                <Typography color="gray">Empty Slot</Typography>
                            )}
                        </Box>
                    );
                })}
            </Box>

            <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center" sx={{ py: 0.5 }}>
                {Array.from({ length: totalPages }).map((_, i) => (
                    <Box
                        key={i}
                        onClick={() => goto(i)}
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            cursor: 'pointer',
                            opacity: i === page ? 1 : 0.4,
                            backgroundColor: 'text.primary',
                        }}
                    />
                ))}
            </Stack>
        </Box>
    );
}

// ---- Video Grid ----
const VideoGrid: React.FC<VideoGridProps> = ({ streams }) => {
    const [gridSize, setGridSize] = useState<number>(2);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const isMobile = useMediaQuery('(max-width:600px)');

    if (isMobile) return <MobileCarousel streams={streams} />;

    const slotsPerPage = gridSize * gridSize;
    const totalPages = Math.max(1, Math.ceil(streams.length / slotsPerPage));

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages - 1));
    }, [slotsPerPage, totalPages]);

    const start = currentPage * slotsPerPage;
    const pageStreams = streams.slice(start, start + slotsPerPage);
    const paddedStreams: (StreamItem | null)[] = [...pageStreams];
    while (paddedStreams.length < slotsPerPage) paddedStreams.push(null);

    const handleGridSizeChange = (_e: React.MouseEvent<HTMLElement>, newValue: number | null) => {
        if (newValue !== null) {
            setGridSize(newValue);
            setCurrentPage(0);
        }
    };
    const goPrev = () => setCurrentPage((p) => (p > 0 ? p - 1 : p));
    const goNext = () => setCurrentPage((p) => (p < totalPages - 1 ? p + 1 : p));
    const goto = (idx: number) => setCurrentPage(idx);

    return (
        <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', pl: 1 }}>
                    <Typography variant="h6" sx={{ mr: 1 }}>Grid:</Typography>
                    <ToggleButtonGroup
                        color="primary"
                        value={gridSize}
                        exclusive
                        onChange={handleGridSizeChange}
                        sx={{
                            '& .MuiToggleButton-root': {
                                padding: '2px 6px !important',
                                fontSize: '1rem !important',
                                minWidth: '36px !important',
                                minHeight: '28px !important',
                                lineHeight: '1.2 !important',
                            },
                        }}
                    >
                        <ToggleButton value={1}>1 × 1</ToggleButton>
                        <ToggleButton value={2}>2 × 2</ToggleButton>
                        <ToggleButton value={3}>3 × 3</ToggleButton>
                    </ToggleButtonGroup>
                </Box>

                <Stack direction="row" spacing={1} alignItems="center">
                    <Tooltip title="Previous">
                        <span>
                            <IconButton onClick={goPrev} disabled={currentPage === 0}>
                                <ChevronLeftIcon />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                        {Array.from({ length: totalPages }).map((_, i) => (
                            <Box
                                key={i}
                                onClick={() => goto(i)}
                                sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    opacity: i === currentPage ? 1 : 0.4,
                                    backgroundColor: 'text.primary',
                                }}
                            />
                        ))}
                    </Stack>
                    <Tooltip title="Next">
                        <span>
                            <IconButton onClick={goNext} disabled={currentPage === totalPages - 1}>
                                <ChevronRightIcon />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>
            </Box>

            <Box
                sx={{
                    display: 'grid',
                    width: '100%',
                    flex: 1,
                    gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                    gridTemplateRows: `repeat(${gridSize}, 1fr)`,
                    gap: 0,
                    minHeight: 240,
                }}
            >
                {paddedStreams.map((stream, index) => {
                    const globalIdx = start + index;
                    const validUrl = !!(stream?.url && typeof stream.url === 'string' && stream.url.trim());
                    return (
                        <Box
                            key={stream?.url ?? `empty-${globalIdx}`}
                            sx={{
                                position: 'relative',
                                width: '100%',
                                height: '100%',
                                backgroundColor: '#000',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {stream && validUrl ? (
                                <>
                                    <HLSPlayer src={stream.url} />
                                    <Typography
                                        variant="subtitle2"
                                        sx={{
                                            position: 'absolute',
                                            top: 8,
                                            right: 8,
                                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                            color: 'white',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.875rem',
                                            zIndex: 1,
                                        }}
                                    >
                                        {stream.title ?? `Stream ${globalIdx + 1}`}
                                    </Typography>
                                </>
                            ) : (
                                <Typography color="gray">Empty Slot</Typography>
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};

export default VideoGrid;
