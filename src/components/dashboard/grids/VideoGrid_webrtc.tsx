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

// ---- Types ----
export type StreamItem = { url: string; title?: string };
type WebRTCPlayerProps = { src: string };
type VideoGridProps = { streams: StreamItem[] };

// ---- 작은 헬퍼: 네트워크 상태 대충 판단(옵션) ----
function isCellularLike() {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as any;
    try {
        const type = nav.connection?.effectiveType || '';
        return /2g|3g|cellular/i.test(type);
    } catch {
        return false;
    }
}

// ---- WebRTC Player (WHEP 수신 + 자동 재시도 + 가시성 워치독) ----
const WebRTCPlayer: React.FC<WebRTCPlayerProps> = ({ src }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const sessionUrlRef = useRef<string | null>(null); // WHEP 리소스 URL (Location 헤더)
    const abortRef = useRef<AbortController | null>(null);

    const retryCount = useRef(0);
    const retryTimer = useRef<number | null>(null);
    const slowRetryTimer = useRef<number | null>(null);

    const unbindVisRef = useRef<null | (() => void)>(null);
    const [error, setError] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [, setIsBuffering] = useState(true);

    const HARD_LIMIT = 5;
    const BASE = 1500; // ms (백오프 시작)
    const SLOW_INTERVAL = 30_000;

    const clearTimers = () => {
        if (retryTimer.current) {
            window.clearTimeout(retryTimer.current);
            retryTimer.current = null;
        }
        if (slowRetryTimer.current) {
            window.clearInterval(slowRetryTimer.current);
            slowRetryTimer.current = null;
        }
    };

    const cleanupPeer = () => {
        try {
            if (pcRef.current) {
                pcRef.current.ontrack = null;
                pcRef.current.oniceconnectionstatechange = null;
                pcRef.current.onconnectionstatechange = null;
                pcRef.current.close();
            }
        } catch { }
        pcRef.current = null;

        try {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
            }
        } catch { }
        streamRef.current = null;

        const v = videoRef.current;
        if (v) {
            try {
                v.srcObject = null;
                v.removeAttribute('src');
                v.load?.();
            } catch { }
        }

        // 세션 종료 (WHEP 리소스 삭제, 구현체에 따라 선택)
        if (sessionUrlRef.current && abortRef.current) {
            try {
                fetch(sessionUrlRef.current, { method: 'DELETE', signal: abortRef.current.signal }).catch(() => { });
            } catch { }
        }
        sessionUrlRef.current = null;

        try {
            abortRef.current?.abort();
        } catch { }
        abortRef.current = null;
    };

    const cleanupAll = () => {
        clearTimers();
        cleanupPeer();
        try {
            unbindVisRef.current?.();
        } catch { }
        unbindVisRef.current = null;
    };

    const onRecovered = () => {
        setError(false);
        clearTimers();
    };

    const ensureSlowRetry = () => {
        if (slowRetryTimer.current) return;
        slowRetryTimer.current = window.setInterval(() => {
            cleanupAll();
            setup();
        }, SLOW_INTERVAL) as unknown as number;
    };

    const scheduleRetry = (delay: number) => {
        if (retryTimer.current) window.clearTimeout(retryTimer.current);
        retryTimer.current = window.setTimeout(() => {
            cleanupAll();
            setup();
        }, delay) as unknown as number;
    };

    const retry = () => {
        const n = retryCount.current++;
        const jitter = Math.random() * 400;
        const delay = Math.min(10_000, BASE * Math.pow(1.7, n) + jitter);
        setError(true);
        setIsReady(false);
        setIsBuffering(true);
        scheduleRetry(delay);
        if (n >= HARD_LIMIT) ensureSlowRetry();
    };

    // 가시성 변화 시 자원 절약/복구
    function handleVisibilityChange(visible: boolean) {
        const v = videoRef.current;
        if (!v) return;

        if (!visible) {
            try {
                v.pause();
            } catch { }
            // 완전 종료 대신 유지하려면 주석 해제
            // cleanupPeer(); // 숨겨지면 트래픽 아끼려면 종료
            return;
        }
        // 다시 보이면 재생/복구
        try {
            if (v.paused) v.play().catch(() => { });
        } catch { }
        if (!pcRef.current) {
            // 완전 종료를 했다면 재수립
            setup();
        }
    }

    function bindVisibilityObserver(rootEl: HTMLElement) {
        let last = true;
        const io = new IntersectionObserver(
            ([e]) => {
                const r = e.intersectionRatio;
                const next = r >= 0.75 ? true : r <= 0.25 ? false : last;
                if (next !== last) {
                    last = next;
                    handleVisibilityChange(next);
                }
            },
            { threshold: [0, 0.25, 0.75, 1], rootMargin: '8px' },
        );
        io.observe(rootEl);
        return () => io.disconnect();
    }

    // 문서 가시성 복구
    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'visible') {
                const v = videoRef.current;
                if (v && v.paused) {
                    try {
                        v.play().catch(() => { });
                    } catch { }
                }
                if (!pcRef.current) setup();
            }
        };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // video 이벤트 (스피너/상태)
    const onLoadedData = () => {
        setIsBuffering(false);
        setIsReady(true);
    };
    const onPlaying = () => {
        setIsBuffering(false);
        setIsReady(true);
        onRecovered();
    };

    const attachVideoListeners = (v: HTMLVideoElement) => {
        v.addEventListener('loadeddata', onLoadedData);
        v.addEventListener('playing', onPlaying);
    };
    const detachVideoListeners = (v: HTMLVideoElement) => {
        v.removeEventListener('loadeddata', onLoadedData);
        v.removeEventListener('playing', onPlaying);
    };

    // 메인 셋업 (WHEP 비-트리클)
    const setup = async () => {
        const video = videoRef.current;
        if (!video) return;

        // src 유효성 체크
        if (typeof src !== 'string' || !src.trim()) {
            console.warn('[WebRTCPlayer] invalid src:', src);
            setError(true);
            setIsReady(false);
            setIsBuffering(false);
            return;
        }

        // 초기 상태
        setError(false);
        setIsReady(false);
        setIsBuffering(true);

        // 기존 정리
        cleanupPeer();
        attachVideoListeners(video);

        // Abort 컨트롤러 준비
        const ac = new AbortController();
        abortRef.current = ac;

        // RTCPeerConnection 기본 설정
        const pc = new RTCPeerConnection({
            iceServers: [
                // 필요시 TURN 추가
                { urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] },
            ],
            // 대규모 다수 피어 수신 시 메모리 튜닝 필요할 수 있음
        });
        pcRef.current = pc;

        // 수신 전용 트랜시버 추가 (비디오/오디오)
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        // track 수신 → video.srcObject 연결
        const ms = new MediaStream();
        streamRef.current = ms;
        pc.ontrack = (ev) => {
            ev.streams?.[0]?.getTracks().forEach((t) => ms.addTrack(t));
            video.srcObject = ms;
            // 자동재생 시도
            Promise.resolve().then(() => video.play().catch(() => { }));
        };

        // 연결 상태 모니터링
        pc.onconnectionstatechange = () => {
            const s = pc.connectionState;
            if (s === 'connected') onRecovered();
            if (s === 'failed' || s === 'disconnected' || s === 'closed') {
                retry();
            }
        };

        try {
            // 비-트리클: gather 끝난 뒤 SDP 전송
            await pc.setLocalDescription(await pc.createOffer({ iceRestart: false }));

            // ICE gathering 완료 대기
            await new Promise<void>((resolve) => {
                if (pc.iceGatheringState === 'complete') return resolve();
                const check = () => {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', check);
                        resolve();
                    }
                };
                pc.addEventListener('icegatheringstatechange', check);
            });

            const offerSdp = pc.localDescription?.sdp || '';
            if (!offerSdp) throw new Error('No local SDP');

            // WHEP 초기 POST (answer + Location 수신 기대)
            const resp = await fetch(src, {
                method: 'POST',
                headers: { 'Content-Type': 'application/sdp' },
                body: offerSdp,
                signal: ac.signal,
            });

            if (!resp.ok) {
                throw new Error(`WHEP POST failed: ${resp.status}`);
            }

            const answerSdp = await resp.text();
            const location = resp.headers.get('Location'); // WHEP resource URL
            if (location) sessionUrlRef.current = location;

            await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

            onRecovered();
            setIsBuffering(false);
            setIsReady(true);

            // 가시성 옵저버 바인딩 (한 번만)
            if (!unbindVisRef.current) {
                unbindVisRef.current = bindVisibilityObserver(video);
            }
        } catch (e) {
            console.error('[WebRTCPlayer] setup error:', e);
            retry();
        }
    };

    useEffect(() => {
        retryCount.current = 0;
        setup();
        return () => {
            clearTimers();
            const v = videoRef.current;
            if (v) detachVideoListeners(v);
            cleanupAll();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                preload="metadata"
                disablePictureInPicture
                controls={false}
                controlsList="nodownload noplaybackrate nofullscreen"
                // @ts-ignore
                webkit-playsinline="true"
                style={{ width: '100%', height: '100%', objectFit: 'fill' }}
            />

            {!error && !isReady && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: 'rgba(0,0,0,0.45)',
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
                        textAlign: 'center',
                        px: 2,
                    }}
                >
                    <Typography variant="body2">스트림 오류 — 재연결 중…</Typography>
                </Box>
            )}
        </div>
    );
};

// ---- 모바일 전용 캐러셀 (그대로, 플레이어만 교체) ----
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
    const onTouchStart = (e: React.TouchEvent) => {
        touch.current.x = e.touches[0].clientX;
    };
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
                    <IconButton onClick={goPrev} disabled={page === 0}>
                        <ChevronLeftIcon />
                    </IconButton>
                    <IconButton onClick={goNext} disabled={page === totalPages - 1}>
                        <ChevronRightIcon />
                    </IconButton>
                </Stack>
            </Box>

            <Box
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    minHeight: 0,
                    gap: 6 / 8,
                    px: 1,
                    pb: 1,
                }}
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
                                    <WebRTCPlayer src={stream.url} />
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

// ---- Video Grid (그대로, 플레이어만 교체) ----
const VideoGrid: React.FC<VideoGridProps> = ({ streams }) => {
    const [gridSize, setGridSize] = useState<number>(2);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const isMobile = useMediaQuery('(max-width:600px)');

    if (isMobile) {
        return <MobileCarousel streams={streams} />;
    }

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
            {/* 상단 컨트롤 */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', pl: 1 }}>
                    <Typography variant="h6" sx={{ mr: 1 }}>
                        Grid:
                    </Typography>
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

                {/* 페이지 컨트롤 */}
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

            {/* 비디오 그리드 */}
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
                                    <WebRTCPlayer src={stream.url} />
                                    <Typography
                                        variant="subtitle2"
                                        sx={{
                                            position: 'absolute',
                                            top: '8px',
                                            right: '8px',
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
