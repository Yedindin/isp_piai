import { DateTime } from "luxon";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Stack,
    Typography,
    Chip,
    Tooltip,
    Divider,
    Menu,
    MenuItem,
    Card,
    CardContent,
    Box,
    Snackbar,
    Alert as MuiAlert,
    TextField,
} from "@mui/material";
import { keyframes } from "@mui/system";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import ReportRoundedIcon from "@mui/icons-material/ReportRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import SensorsRoundedIcon from "@mui/icons-material/SensorsRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import VolumeOffRoundedIcon from "@mui/icons-material/VolumeOffRounded";
import alertMp3 from "@/assets/mp3/alert.mp3";

export type AlertSeverity = "info" | "warning" | "danger";
export type AlertItem = {
    id: string;
    site: string;
    sensor_id: string;
    model: string;
    title?: string;
    message?: string;
    started_at?: string;
    severity: AlertSeverity;
    short_filename?: string | null;
    streamUrl?: string;
};

type Ctx = {
    enqueueAlert: (a: AlertItem) => void;
    mute: (ms: number) => void;
    isMuted: boolean;
};

const AlertCenterCtx = createContext<Ctx | null>(null);
export function useAlertCenter() {
    const ctx = useContext(AlertCenterCtx);
    if (!ctx) throw new Error("useAlertCenter must be used within <AlertCenterProvider>");
    return ctx;
}

type Props = {
    children: React.ReactNode;
    defaultStreamBySensor?: Record<string, string>;
    pageBlinkTitle?: string;
};

/* TS 전역 선언: 싱글톤 가드) */
declare global {
    interface Window {
        __ALERT_CENTER_ACTIVE__?: boolean;
    }
}

/* Alarm animations & colors */
const glowPulse = keyframes`
  0% { box-shadow: 0 0 0px rgba(0,0,0,0), 0 0 8px currentColor; }
  50% { box-shadow: 0 0 20px currentColor, 0 0 40px currentColor; }
  100% { box-shadow: 0 0 0px rgba(0,0,0,0), 0 0 8px currentColor; }
`;
const gentleShake = keyframes`
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-1.5px); }
  75% { transform: translateX(1.5px); }
`;
const blinkDot = keyframes`
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
`;
const scrollStripes = keyframes`
  from { transform: translateX(-40px); }
  to   { transform: translateX(0); }
`;
const sevColorMap = {
    info: "#1976d2",
    warning: "#ed6c02",
    danger: "#d32f2f",
} as const;

/* 3단계 복사 유틸 */
async function copyWithClipboardAPI(text: string) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
    }
    return false;
}
function copyWithExecCommand(text: string) {
    try {
        const onCopy = (e: ClipboardEvent) => {
            e.clipboardData?.setData("text/plain", text);
            e.preventDefault();
        };
        document.addEventListener("copy", onCopy);
        const ok = document.execCommand("copy");
        document.removeEventListener("copy", onCopy);
        return ok;
    } catch {
        return false;
    }
}
function copyWithHiddenTextarea(text: string) {
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

/* 수동 복사 다이얼로그 */
const ManualCopyDialog: React.FC<{
    open: boolean;
    text: string;
    onClose: () => void;
}> = ({ open, text, onClose }) => {
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (!open) return;
        setTimeout(() => {
            const el = inputRef.current;
            if (el) {
                el.focus();
                (el as HTMLTextAreaElement).select?.();
            }
        });
    }, [open]);

    const reselect = () => {
        const el = inputRef.current as HTMLTextAreaElement | null;
        if (!el) return;
        el.focus();
        el.select();
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>내용 복사</DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" sx={{ mb: 1 }}>
                    아래 내용을 선택한 뒤 <strong>Ctrl/⌘ + C</strong>로 복사하세요.
                </Typography>
                <TextField
                    inputRef={inputRef}
                    fullWidth
                    multiline
                    minRows={6}
                    value={text}
                    onChange={() => { }}
                />
            </DialogContent>
            <DialogActions>
                <Button variant="outlined" onClick={reselect}>
                    다시 선택
                </Button>
                <Button
                    variant="contained"
                    startIcon={<CloseRoundedIcon />}
                    onClick={onClose}
                >
                    닫기
                </Button>
            </DialogActions>
        </Dialog>
    );
};

/* 단편 영상 다이얼로그 (HLS 미사용) */
const ClipViewer: React.FC<{
    open: boolean;
    src: string | null;
    onClose: () => void;
    onCanPlay?: () => void;
    onError?: () => void;
    registerRef?: (el: HTMLVideoElement | null) => void;
}> = ({ open, src, onClose, onCanPlay, onError, registerRef }) => {
    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
            <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography
                    variant="h6"
                    sx={{ flex: 1, fontWeight: 700 }}
                >
                    단편 영상
                </Typography>
            </DialogTitle>
            <DialogContent dividers>
                {src ? (
                    <video
                        src={src}
                        controls
                        autoPlay
                        playsInline
                        onCanPlay={onCanPlay}
                        onError={onError}
                        ref={registerRef ?? undefined}
                        style={{
                            width: "100%",
                            maxHeight: "70vh",
                            borderRadius: 8,
                        }}
                    />
                ) : (
                    <Typography>표시할 영상이 없습니다.</Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={onClose}
                    variant="contained"
                    startIcon={<CloseRoundedIcon />}
                >
                    닫기
                </Button>
            </DialogActions>
        </Dialog>
    );
};

/* 재시도 간격 */
function backoffMs() {
    return 1000;
}

export const AlertCenterProvider: React.FC<Props> = ({
    children,
    defaultStreamBySensor = {},
    pageBlinkTitle = "🚨 ALERT",
}) => {
    const [queue, setQueue] = useState<AlertItem[]>([]);
    const [current, setCurrent] = useState<AlertItem | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isMuted, setIsMuted] = useState(false);

    /* ---- 싱글톤 UI 가드 ---- */
    const [uiEnabled, setUiEnabled] = useState(true);
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (window.__ALERT_CENTER_ACTIVE__) {
            setUiEnabled(false);
            return;
        }
        window.__ALERT_CENTER_ACTIVE__ = true;
        return () => {
            if (window.__ALERT_CENTER_ACTIVE__) {
                delete window.__ALERT_CENTER_ACTIVE__;
            }
        };
    }, []);

    const muteUntilRef = useRef<number>(0);
    const titleBlinkRef = useRef<number | null>(null);
    const origTitleRef = useRef<string>(
        typeof document !== "undefined" ? document.title : ""
    );
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const prefersReducedMotion = useMemo(() => {
        if (typeof window === "undefined") return false;
        return (
            window.matchMedia?.("(prefers-reduced-motion: reduce)")
                .matches ?? false
        );
    }, []);

    const recentRef = useRef<Map<string, number>>(new Map());
    const DEDUP_MS = 10_000;
    const API_BASE = import.meta.env.VITE_API_BASE as string | undefined;

    // ✅ ACK된 알림 키 보관
    const dismissedRef = useRef<Set<string>>(new Set());
    const alertKey = (a: AlertItem) => `${a.id}|${a.started_at ?? ""}`;

    // 복사/수동복사 상태
    const [copyOpen, setCopyOpen] = useState(false);
    const [copyErr, setCopyErr] = useState<string | null>(null);
    const [manualCopyOpen, setManualCopyOpen] = useState(false);
    const manualCopyTextRef = useRef<string>("");

    // 무음 메뉴
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const openMuteMenu = (e: React.MouseEvent<HTMLElement>) =>
        setAnchorEl(e.currentTarget);
    const closeMuteMenu = () => setAnchorEl(null);

    // 단편 영상 다이얼로그
    const [clipOpen, setClipOpen] = useState(false);

    // 영상 src 및 재시도 관련
    const [clipSrc, setClipSrc] = useState<string | null>(null);
    const clipRetryTimerRef = useRef<number | null>(null);
    const clipAttemptRef = useRef(0);
    const clipStartRef = useRef<number>(0); // 재시도 시작 시각
    const MAX_WAIT_MS = 5 * 60_000; // 최대 5분 대기

    // 사운드 준비
    useEffect(() => {
        if (typeof window === "undefined") return;
        const audio = new Audio(alertMp3);
        audio.preload = "auto";
        audioRef.current = audio;
        return () => {
            audioRef.current = null;
        };
    }, []);

    // 타이틀 깜빡임
    const blinkTitleStart = useCallback(() => {
        if (typeof document === "undefined") return;
        if (prefersReducedMotion) return;
        if (titleBlinkRef.current) return;
        origTitleRef.current = document.title;
        let on = false;
        titleBlinkRef.current = window.setInterval(() => {
            document.title = on
                ? pageBlinkTitle
                : origTitleRef.current;
            on = !on;
        }, 800);
    }, [pageBlinkTitle, prefersReducedMotion]);

    const blinkTitleStop = useCallback(() => {
        if (typeof document === "undefined") return;
        if (titleBlinkRef.current) {
            clearInterval(titleBlinkRef.current);
            titleBlinkRef.current = null;
            document.title = origTitleRef.current;
        }
    }, []);

    useEffect(() => {
        return () => {
            blinkTitleStop();
        };
    }, [blinkTitleStop]);

    // 브라우저 알림
    const tryNotify = useCallback((a: AlertItem) => {
        if (typeof window === "undefined") return;
        if (!("Notification" in window)) return;

        const show = () => {
            new Notification(a.title ?? "위험 감지", {
                body: a.message ?? `${a.site}/${a.sensor_id}`,
                tag: a.id,
            });
        };

        if (Notification.permission === "granted") {
            show();
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then((perm) => {
                if (perm === "granted") show();
            });
        }
    }, []);

    const playSound = useCallback(() => {
        if (isMuted) return;
        const now = Date.now();
        if (now < muteUntilRef.current) return;
        audioRef.current?.play().catch(() => { });
    }, [isMuted]);

    // 큐 → 현재 알림
    useEffect(() => {
        if (!current && queue.length > 0) {
            const [head, ...rest] = queue;
            setCurrent(head);
            setQueue(rest);
            setIsOpen(true);
            blinkTitleStart();
            tryNotify(head);
            playSound();
        }
    }, [queue, current, blinkTitleStart, tryNotify, playSound]);

    const closeCurrent = useCallback(() => {
        // 현재 알림은 ACK된 것으로 기록하고, 같은 키를 가진 큐 아이템 제거
        if (current) {
            const key = alertKey(current);
            dismissedRef.current.add(key);
            setQueue((q) => q.filter((item) => alertKey(item) !== key));
        }

        setIsOpen(false);
        setCurrent(null);
        blinkTitleStop();

        // 클립 재시도 타이머 정리
        if (clipRetryTimerRef.current) {
            clearTimeout(clipRetryTimerRef.current);
            clipRetryTimerRef.current = null;
        }
        setClipSrc(null);
    }, [blinkTitleStop, current]);

    const ack = useCallback(() => {
        closeCurrent();
    }, [closeCurrent]);

    const mute = useCallback((ms: number) => {
        setIsMuted(true);
        muteUntilRef.current = Date.now() + ms;
        window.setTimeout(() => setIsMuted(false), ms);
    }, []);

    /* enqueue + 디듀프 (업데이트 + ACK된 알림 무시) */
    const enqueueAlert = useCallback(
        (a: AlertItem) => {
            if (!a.streamUrl && defaultStreamBySensor[a.sensor_id]) {
                a = {
                    ...a,
                    streamUrl: defaultStreamBySensor[a.sensor_id],
                };
            }

            const key = alertKey(a);
            const now = Date.now();
            const last = recentRef.current.get(key) ?? 0;

            // 이미 ACK된 알림이면 완전히 무시
            if (dismissedRef.current.has(key)) {
                return;
            }

            // 짧은 시간 내에 같은 알림 반복 → 현재 것만 업데이트하고 새로 안 쌓음
            if (now - last < DEDUP_MS) {
                if (current && alertKey(current) === key) {
                    setCurrent((prev) => (prev ? { ...prev, ...a } : prev));
                }
                return;
            }

            recentRef.current.set(key, now);

            setQueue((q) => {
                const same = (it: AlertItem) => alertKey(it) === key;

                // 현재 표시 중 알림 업데이트
                if (current && same(current)) {
                    setCurrent((prev) =>
                        prev ? { ...prev, ...a } : prev
                    );
                    return q;
                }

                // 큐에 이미 있으면 업데이트
                if (q.some(same)) {
                    return q.map((it) =>
                        same(it) ? { ...it, ...a } : it
                    );
                }

                // 새 알림이면 enqueue
                return q.concat(a);
            });
        },
        [current, defaultStreamBySensor]
    );

    // URL 빌더
    function buildShortClipUrl(opts: {
        site?: string;
        model?: string;
        sensor_id?: string;
        short_filename?: string | null;
        apiBase?: string;
    }) {
        const {
            site,
            model,
            sensor_id,
            short_filename,
            apiBase,
        } = opts;
        if (
            !site ||
            !model ||
            !sensor_id ||
            !short_filename
        )
            return null;
        const folderKey = `${site}-${model}-INFERENCE-${sensor_id}`.toUpperCase();
        const base = (apiBase ?? "").replace(/\/+$/, "");
        const path = `/media/video/${encodeURIComponent(
            folderKey
        )}/${encodeURIComponent(short_filename)}`;
        return `${base}${path}`;
    }

    const shortClipUrl = useMemo(
        () =>
            buildShortClipUrl({
                site: current?.site,
                model: current?.model,
                sensor_id: current?.sensor_id,
                short_filename:
                    current?.short_filename ?? null,
                apiBase: API_BASE,
            }),
        [current, API_BASE]
    );

    const value = useMemo<Ctx>(
        () => ({ enqueueAlert, mute, isMuted }),
        [enqueueAlert, mute, isMuted]
    );

    /* ===== 포맷터 ===== */
    function formatKST(iso?: string) {
        if (!iso) return "-";
        return DateTime.fromISO(iso, { zone: "utc" })
            .setZone("Asia/Seoul")
            .toFormat("yy년 MM월 dd일 a hh:mm:ss");
    }
    function formatRelative(iso?: string) {
        if (!iso) return "";
        const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(
            "Asia/Seoul"
        );
        return (
            dt.toRelative({
                base: DateTime.now().setZone("Asia/Seoul"),
                locale: "ko",
            }) ?? ""
        );
    }

    const sevColor: "default" | "info" | "warning" | "error" =
        current?.severity === "danger"
            ? "error"
            : current?.severity === "warning"
                ? "warning"
                : "info";

    // 상대시간 갱신 트리거 (re-render용)
    useEffect(() => {
        if (!isOpen) return;
        const t = window.setInterval(
            () => setQueue((q) => q.slice()),
            1000
        );
        return () => clearInterval(t);
    }, [isOpen]);

    // 내용 복사
    const handleCopy = useCallback(
        async (e?: React.MouseEvent<HTMLButtonElement>) => {
            if (!current) return;
            const text =
                `[알림]\n` +
                `제목: ${current.title ?? "안전 알림"}\n` +
                `심각도: ${current.severity}\n` +
                `위치: ${current.site}\n` +
                `센서: ${current.sensor_id}\n` +
                `발생시각: ${formatKST(
                    current.started_at
                )} (${formatRelative(
                    current.started_at
                )})\n` +
                (current.message
                    ? `내용: ${current.message}\n`
                    : ``) +
                (shortClipUrl
                    ? `클립: ${shortClipUrl}\n`
                    : ``);

            e?.currentTarget?.blur();

            try {
                const ok1 =
                    await copyWithClipboardAPI(text);
                if (ok1) {
                    setCopyErr(null);
                    setCopyOpen(true);
                    return;
                }
            } catch { }

            const ok2 = copyWithExecCommand(text);
            if (ok2) {
                setCopyErr(null);
                setCopyOpen(true);
                return;
            }

            const ok3 = copyWithHiddenTextarea(text);
            if (ok3) {
                setCopyErr(null);
                setCopyOpen(true);
                return;
            }

            manualCopyTextRef.current = text;
            setManualCopyOpen(true);
        },
        [current, shortClipUrl]
    );

    // 다이얼로그 닫기: ACK만 허용
    const handleDialogClose = useCallback(
        (_: unknown, reason?: "backdropClick" | "escapeKeyDown") => {
            if (
                reason === "backdropClick" ||
                reason === "escapeKeyDown"
            )
                return;
        },
        []
    );

    /* 파일이 생길 때까지: video onError 기반 재시도
    *  파일이 생길 때까지: HEAD 폴링으로 재시도
    */
    useEffect(() => {
        // 다이얼로그 닫히거나 클립 URL 없으면 정리
        if (!isOpen || !current || !shortClipUrl) {
            setClipSrc(null);
            clipAttemptRef.current = 0;
            if (clipRetryTimerRef.current) {
                clearTimeout(clipRetryTimerRef.current);
                clipRetryTimerRef.current = null;
            }
            return;
        }

        let canceled = false;
        clipStartRef.current = Date.now();
        clipAttemptRef.current = 0;

        if (clipRetryTimerRef.current) {
            clearTimeout(clipRetryTimerRef.current);
            clipRetryTimerRef.current = null;
        }

        const probe = async () => {
            if (canceled) return;

            const elapsed = Date.now() - clipStartRef.current;
            if (elapsed > MAX_WAIT_MS) {
                // 최대 대기 시간 초과 → 포기
                return;
            }

            const v = clipAttemptRef.current++;
            const url = `${shortClipUrl}?v=${v}`;

            try {
                const res = await fetch(url, {
                    method: "HEAD",
                    cache: "no-store",
                });

                if (res.ok) {
                    // 실제로 파일이 생김 → 이 URL로 비디오 재생
                    setClipSrc(url);
                    return;
                }
            } catch {
                // 네트워크 에러면 그냥 백오프 후 재시도
            }

            // 아직 없으면 잠깐 쉬고 다시
            clipRetryTimerRef.current = window.setTimeout(probe, backoffMs()) as unknown as number;
        };

        // 바로 1회 시도
        probe();

        return () => {
            canceled = true;
            if (clipRetryTimerRef.current) {
                clearTimeout(clipRetryTimerRef.current);
                clipRetryTimerRef.current = null;
            }
        };
    }, [isOpen, current, shortClipUrl]);


    const handleClipCanPlay = useCallback(() => {
        // 비디오가 실제로 재생되기 시작하면 재시도 타이머 정리
        if (clipRetryTimerRef.current) {
            clearTimeout(clipRetryTimerRef.current);
            clipRetryTimerRef.current = null;
        }
    }, []);


    return (
        <AlertCenterCtx.Provider value={value}>
            {children}

            {uiEnabled && (
                <>
                    <Dialog
                        open={Boolean(isOpen && current)}
                        onClose={handleDialogClose}
                        maxWidth="sm"
                        fullWidth
                        disableEscapeKeyDown
                        slotProps={{
                            paper: {
                                sx: (theme) => ({
                                    borderWidth: 2,
                                    borderStyle: "solid",
                                    borderColor:
                                        sevColorMap[
                                        current?.severity ??
                                        "info"
                                        ],
                                    color:
                                        sevColorMap[
                                        current?.severity ??
                                        "info"
                                        ],
                                    animation:
                                        prefersReducedMotion
                                            ? undefined
                                            : `${glowPulse} 2s ease-in-out infinite, ${gentleShake} 1.2s ease-in-out infinite`,
                                    position: "relative",
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        left: 0,
                                        top: 0,
                                        bottom: 0,
                                        width: 6,
                                        background: `linear-gradient(180deg, ${sevColorMap[
                                            current
                                                ?.severity ??
                                            "info"
                                        ]
                                            } 0%, transparent 100%)`,
                                        borderTopLeftRadius:
                                            theme.shape
                                                .borderRadius,
                                        borderBottomLeftRadius:
                                            theme.shape
                                                .borderRadius,
                                    },
                                }),
                            },
                        }}
                    >
                        {/* 상단 사이렌 바 */}
                        <Box
                            sx={{
                                height: 6,
                                position: "relative",
                                overflow: "hidden",
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    inset: 0,
                                    width: "200%",
                                    backgroundImage:
                                        "repeating-linear-gradient(45deg, rgba(255,0,0,0.75) 0 12px, rgba(255,255,0,0.95) 12px 24px)",
                                    backgroundSize:
                                        "40px 6px",
                                    animation: `${scrollStripes} 600ms linear infinite`,
                                    willChange:
                                        "transform",
                                }}
                            />
                        </Box>

                        <DialogTitle
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.2,
                                py: 1.2,
                                background: `linear-gradient(90deg, ${sevColorMap[
                                    current?.severity ??
                                    "info"
                                ]
                                    }11, transparent)`,
                            }}
                        >
                            <Box
                                sx={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    bgcolor:
                                        sevColorMap[
                                        current
                                            ?.severity ??
                                        "info"
                                        ],
                                    animation:
                                        prefersReducedMotion
                                            ? undefined
                                            : `${blinkDot} 900ms ease-in-out infinite`,
                                    boxShadow: `0 0 8px ${sevColorMap[
                                        current
                                            ?.severity ??
                                        "info"
                                    ]
                                        }`,
                                }}
                            />
                            {React.createElement(
                                current?.severity ===
                                    "danger"
                                    ? ReportRoundedIcon
                                    : current?.severity ===
                                        "warning"
                                        ? WarningAmberRoundedIcon
                                        : InfoRoundedIcon,
                                {
                                    fontSize: "small",
                                    color:
                                        sevColor ===
                                            "error"
                                            ? "error"
                                            : sevColor ===
                                                "warning"
                                                ? "warning"
                                                : "info",
                                }
                            )}
                            <Typography
                                variant="h6"
                                sx={{
                                    flex: 1,
                                    fontWeight: 800,
                                    letterSpacing: 0.2,
                                }}
                            >
                                {current?.title ??
                                    "안전 알림"}
                            </Typography>
                            <Chip
                                size="small"
                                label={
                                    current?.severity?.toUpperCase() ??
                                    ""
                                }
                                color={sevColor}
                            />
                        </DialogTitle>

                        <DialogContent dividers>
                            <Stack spacing={1.2}>
                                {current?.message && (
                                    <Typography
                                        variant="body1"
                                        sx={{
                                            whiteSpace:
                                                "pre-wrap",
                                        }}
                                    >
                                        {
                                            current.message
                                        }
                                    </Typography>
                                )}

                                <Stack
                                    direction="row"
                                    spacing={1}
                                    flexWrap="wrap"
                                >
                                    <Tooltip title="사이트">
                                        <Chip
                                            icon={
                                                <PlaceRoundedIcon />
                                            }
                                            label={`Site: ${current?.site ??
                                                "-"
                                                }`}
                                        />
                                    </Tooltip>
                                    <Tooltip title="센서 ID">
                                        <Chip
                                            icon={
                                                <SensorsRoundedIcon />
                                            }
                                            label={`Sensor: ${current
                                                ?.sensor_id ??
                                                "-"
                                                }`}
                                        />
                                    </Tooltip>
                                    {!!current?.started_at && (
                                        <Tooltip
                                            title={formatRelative(
                                                current.started_at
                                            )}
                                        >
                                            <Chip
                                                variant="outlined"
                                                sx={{
                                                    fontWeight: 600,
                                                }}
                                                icon={
                                                    <AccessTimeRoundedIcon />
                                                }
                                                label={`발생시각: ${formatKST(
                                                    current.started_at
                                                )}`}
                                            />
                                        </Tooltip>
                                    )}
                                </Stack>

                                {/* 단편 영상 카드 */}
                                {shortClipUrl && (
                                    <>
                                        <Divider
                                            sx={{
                                                my: 0.5,
                                            }}
                                        />
                                        <Card
                                            variant="outlined"
                                            sx={{
                                                borderRadius: 2,
                                            }}
                                        >
                                            <video
                                                src={clipSrc ?? ""}
                                                controls
                                                autoPlay
                                                loop
                                                muted
                                                playsInline
                                                onCanPlay={handleClipCanPlay}
                                                //onError={handleClipError}
                                                style={{
                                                    maxHeight: 360,
                                                    width: "100%",
                                                    display:
                                                        "block",
                                                }}
                                            />
                                            <CardContent
                                                sx={{
                                                    py: 1.2,
                                                    display:
                                                        "flex",
                                                    justifyContent:
                                                        "flex-end",
                                                }}
                                            >
                                                <Button
                                                    size="small"
                                                    onClick={() =>
                                                        setClipOpen(
                                                            true
                                                        )
                                                    }
                                                >
                                                    크게 보기
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    </>
                                )}
                            </Stack>
                        </DialogContent>

                        <DialogActions
                            sx={{
                                px: 2,
                                borderTop: `1px dashed ${sevColorMap[
                                    current?.severity ??
                                    "info"
                                ]
                                    }55`,
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: 1,
                            }}
                        >
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={
                                    <ContentCopyRoundedIcon />
                                }
                                disableRipple
                                disableFocusRipple
                                sx={{
                                    "&:focus,&:focus-visible":
                                    {
                                        outline: "none",
                                        boxShadow: "none",
                                    },
                                }}
                                onClick={handleCopy}
                            >
                                내용 복사
                            </Button>

                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={
                                    <VolumeOffRoundedIcon />
                                }
                                onClick={openMuteMenu}
                            >
                                무음
                            </Button>
                            <Menu
                                anchorEl={anchorEl}
                                open={Boolean(anchorEl)}
                                onClose={closeMuteMenu}
                            >
                                <MenuItem
                                    onClick={() => {
                                        mute(
                                            5 *
                                            60_000
                                        );
                                        closeMuteMenu();
                                    }}
                                >
                                    5분
                                </MenuItem>
                                <MenuItem
                                    onClick={() => {
                                        mute(
                                            30 *
                                            60_000
                                        );
                                        closeMuteMenu();
                                    }}
                                >
                                    30분
                                </MenuItem>
                                <MenuItem
                                    onClick={() => {
                                        mute(
                                            2 *
                                            60 *
                                            60_000
                                        );
                                        closeMuteMenu();
                                    }}
                                >
                                    2시간
                                </MenuItem>
                            </Menu>

                            <Button
                                variant="contained"
                                color="error"
                                endIcon={
                                    <CloseRoundedIcon />
                                }
                                onClick={ack}
                            >
                                확인(ACK)
                            </Button>
                        </DialogActions>
                    </Dialog>

                    <ClipViewer
                        open={clipOpen}
                        onClose={() => setClipOpen(false)}
                        src={clipSrc}
                        onCanPlay={handleClipCanPlay}
                    //onError={handleClipError}
                    />

                    <ManualCopyDialog
                        open={manualCopyOpen}
                        onClose={() =>
                            setManualCopyOpen(false)
                        }
                        text={
                            manualCopyTextRef.current
                        }
                    />

                    <Snackbar
                        open={copyOpen}
                        autoHideDuration={2000}
                        onClose={() =>
                            setCopyOpen(false)
                        }
                        anchorOrigin={{
                            vertical: "bottom",
                            horizontal: "center",
                        }}
                    >
                        <MuiAlert
                            onClose={() =>
                                setCopyOpen(false)
                            }
                            severity={
                                copyErr
                                    ? "error"
                                    : "success"
                            }
                            variant="filled"
                            elevation={6}
                            sx={{ width: "100%" }}
                        >
                            {copyErr ?? "복사 완료!"}
                        </MuiAlert>
                    </Snackbar>
                </>
            )}
        </AlertCenterCtx.Provider>
    );
};
