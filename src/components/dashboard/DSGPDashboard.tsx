import React, { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { Box, Card, CardContent, CardHeader } from '@mui/material';
import Grid from '@mui/material/Grid';
// import { useTheme, useMediaQuery } from '@mui/material';
import { api } from "@/lib/api"; // 너의 axios 인스턴스 경로

import { useAlertCenter } from "@/components/dashboard/alerts/AlertsCenter"
import useAlertStreamCORS, { type AlertMsg } from '@/lib/data';
import { Snackbar, Alert } from '@mui/material';

import LogPlayerCard from '@/components/dashboard/cards/LogPlayerCard'
import SensorLineChart from '@/components/dashboard/graphs/SensorLineChart'
import HazardGauge from '@/components/dashboard/graphs/HazardGauge';
// import VideoGrid, { type StreamItem } from '@/components/dashboard/grids/VideoGrid';
const VideoGrid = lazy(() => import('@/components/dashboard/grids/VideoGrid'));
import type { StreamItem } from '@/components/dashboard/grids/VideoGrid';





// 만약 VideoGrid에서 StreamItem을 export하지 않는다면 아래 주석 해제해서 로컬 선언
// type StreamItem = { url: string; title?: string };


// ----- 스트림 리스트 -----
const streams: StreamItem[] = [
    { url: 'http://piai_kafka3.aiot.town:20001/dgsp_tapo1/stream2/index.m3u8', title: '화재 CAM' },
    { url: 'http://piai_kafka3.aiot.town:20001/dgsp_realsense1/stream1/index.m3u8', title: '로봇팔 CAM' },
    { url: 'http://piai_kafka3.aiot.town:20001/dgsp_tapo3/stream2/index.m3u8', title: '챔버 CAM' },
    { url: 'http://piai_kafka3.aiot.town:20001/dgsp_tapo4/stream2/index.m3u8', title: '번호판 CAM' },
];


// ----- 타입 -----
type RiskKey = "chamber_TAPO2" | "gas_SM2" | "zone_TAPO1" | "fire_SM1"; // model_sensorId
type RiskApiResponse =
    | Record<string, number>
    | { items?: Array<{ type: string; value: number }> };

type ActiveAlert = Pick<AlertMsg, 'id' | 'site' | 'sensor_id' | 'started_at'>;

const DGSPDashboard: React.FC = () => {
    const site = 'dgsp';
    const models = ['chamber', 'gas', 'zone', 'fire'];
    const sensorIds = ['TAPO2', 'SM2', 'TAPO1', 'SM1'];
    //const _theme = useTheme();
    // const isMobile = useMediaQuery(theme.breakpoints.down('sm'));   // <600px
    // const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md')); // 600~899px
    // const isDesktop = useMediaQuery(theme.breakpoints.up('md'));    // ≥900px
    // const isXL = useMediaQuery(theme.breakpoints.up('xl'));         // ≥1536px

    // ----- 알람 관련 -----
    const API_BASE = useMemo(() => (import.meta.env.VITE_API_BASE ?? '').replace(/([^:]\/)\/+/g, '$1'), []);
    // const {connected, lastEvent, error } = useAlertStreamCORS({ site: 'DGSP' });
    const { lastEvent, error } = useAlertStreamCORS({ site: 'DGSP' });
    const [_active, setActive] = useState<Map<string, ActiveAlert>>(new Map());
    const [toast, setToast] = useState<{ open: boolean; msg: string; severity: 'success' | 'warning' | 'info' | 'error' }>({
        open: false,
        msg: '',
        severity: 'info',
    });

    const { enqueueAlert } = useAlertCenter();
    useEffect(() => {
        if (!lastEvent) return;
        const key = lastEvent.id || `${lastEvent.site}:${lastEvent.sensor_id}:${lastEvent.started_at}`;
        if (lastEvent.type === "alert_open") {
            enqueueAlert({
                id: key,
                site: lastEvent.site,
                sensor_id: lastEvent.sensor_id,
                started_at: lastEvent.started_at,
                model: lastEvent.model,
                severity: "danger",
                title: lastEvent.title,
                message: "",
                short_filename: lastEvent.filename_s,
                streamUrl: 'http://piai_kafka3.aiot.town:20001/dgsp_tapo1/stream2/index.m3u8', // 있으면 채우고, 없으면 Provider에서 기본 매핑으로 보강
            });
        }
    }, [lastEvent, enqueueAlert]);


    // ----- 위험도 관련 -----

    const [riskPercent, setRiskPercent] = useState<Record<RiskKey, number>>({
        fire_SM1: 0,
        gas_SM2: 0,
        zone_TAPO1: 0,
        chamber_TAPO2: 0,
    });

    const riskParams = useMemo(() => {
        const p = new URLSearchParams();
        p.set("site", site);
        models.forEach((m) => p.append("models[]", m));
        sensorIds.forEach((s) => p.append("sensor_ids[]", s));
        return p;
    }, [site, models, sensorIds]);


    useEffect(() => {
        let stopped = false;
        let inflight = false;
        let controller: AbortController | null = null;
        let timeoutId: number | null = null;
        let backoff = 1000; // 1s 시작

        const toPct = (v?: number) => (v == null ? -1 : v);

        const once = async () => {
            if (stopped || inflight) return;
            if (document.visibilityState !== 'visible') {
                schedule(nextInterval());
                return;
            }
            inflight = true;
            controller?.abort(); // 안전: 이전 요청 취소
            controller = new AbortController();

            try {
                const { data } = await api.get<RiskApiResponse>(
                    `/data/inference/latest_risk?${riskParams.toString()}`,
                    { signal: controller.signal }
                );

                if (!('items' in data)) {
                    const d = data as Record<string, number>;
                    // 값이 바뀐 경우에만 setState → 리렌더/작업 줄이기
                    setRiskPercent(prev => {
                        const next = {
                            fire_SM1: toPct(d.fire_SM1),
                            gas_SM2: toPct(d.gas_SM2),
                            zone_TAPO1: toPct(d.zone_TAPO1),
                            chamber_TAPO2: toPct(d.chamber_TAPO2),
                        };
                        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
                    });
                }

                // 성공 → 백오프 초기화
                backoff = 1000;
            } catch (e: any) {
                if (e?.name !== 'CanceledError' && e?.name !== 'AbortError') {
                    console.warn('[risk] fetch error', e);
                    // 실패 → 점진 백오프(최대 10s)
                    backoff = Math.min(backoff * 2, 10000);
                }
            } finally {
                inflight = false;
                schedule(nextInterval());
            }
        };

        const nextInterval = () => (document.visibilityState === 'visible' ? backoff : 5000);

        const schedule = (ms: number) => {
            if (stopped) return;
            if (timeoutId) window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(once, ms);
        };

        // 첫 트리거
        schedule(0);

        // 가시성 변경 즉시 리스케줄
        const vis = () => schedule(0);
        document.addEventListener('visibilitychange', vis);

        return () => {
            stopped = true;
            document.removeEventListener('visibilitychange', vis);
            controller?.abort();
            if (timeoutId) window.clearTimeout(timeoutId);
        };
        // 의존성: riskParams 문자열만 사용해 실제 변경시에만 리셋
    }, [site, riskParams.toString()]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/alerts/active`, { credentials: 'include' });
                const { alerts } = await res.json();
                setActive(new Map(alerts.map((a: any) => [a.id, a])));
                console.log(alerts)
            } catch (e) {
                console.warn('load active alerts failed', e);
            }
        })();
    }, [API_BASE]);

    useEffect(() => {
        console.log(lastEvent);

        if (!lastEvent) return;
        const key = lastEvent.id || `${lastEvent.site}:${lastEvent.sensor_id}:${lastEvent.started_at}`;

        if (lastEvent.type === 'alert_open') {
            setActive(prev => {
                const next = new Map(prev);
                next.set(key, { id: key, site: lastEvent.site, sensor_id: lastEvent.sensor_id, started_at: lastEvent.started_at });
                return next;
            });
            setToast({ open: true, msg: `🚨 위급: ${lastEvent.site}/${lastEvent.sensor_id}`, severity: 'error' });
        } else if (lastEvent.type === 'alert_close') {
            setActive(prev => {
                const next = new Map(prev);
                next.delete(key);
                return next;
            });
            setToast({ open: true, msg: `✅ 해제: ${lastEvent.site}/${lastEvent.sensor_id}`, severity: 'success' });
        }
    }, [lastEvent]);

    useEffect(() => {
        if (!error) return;
        setToast({ open: true, msg: 'SSE 연결 오류. 자동 재연결 시도 중…', severity: 'warning' });
    }, [error]);


    return (
        <Box sx={{ width: '100%', height: '100%', p: 1 }}>
            <Grid container spacing={1} sx={{ height: '100%' }}>
                {/* 상단: 영상 + 정보창 */}
                <Grid size={{ xs: 12, md: 7 }} sx={{ height: '100%' }}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent sx={{ p: 0, height: '100%' }}>
                            <Suspense fallback={<Box sx={{ p: 2 }}>Loading video…</Box>}>
                                <VideoGrid streams={streams} />
                            </Suspense>
                            {/* <VideoGrid streams={streams} /> */}
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 5 }} sx={{ height: { xs: 'auto', md: '100%' } }}>
                    <Box
                        sx={(t) => ({
                            height: '100%',
                            display: 'grid',
                            gridTemplateRows: '2fr 3fr 2fr',
                            gap: 1,
                            [t.breakpoints.down('sm')]: { gridTemplateRows: 'auto auto auto' },
                        })}
                    >
                        <Card sx={{ height: '100%' }}>
                            <Card sx={{ height: '100%' }}>
                                <CardHeader title="> AI 기반 종합 안전 평가" />
                                <CardContent>
                                    <Grid container spacing={1} sx={{ height: '100%' }}>
                                        <Grid size={{ xs: 6, md: 3 }} sx={{ height: '100%' }}>
                                            <Box sx={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                <HazardGauge title="화재 위험도" value={riskPercent.fire_SM1} valueBounds={[40, 70]} valueMax={100} />
                                            </Box>
                                        </Grid>
                                        <Grid size={{ xs: 6, md: 3 }} sx={{ height: '100%' }}>
                                            <Box sx={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                <HazardGauge title="가스누출 위험도" value={riskPercent.gas_SM2} valueBounds={[40, 70]} valueMax={100} />
                                            </Box>
                                        </Grid>
                                        <Grid size={{ xs: 6, md: 3 }} sx={{ height: '100%' }}>
                                            <Box sx={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                <HazardGauge title="로봇팔 구역 위험도" value={riskPercent.zone_TAPO1} valueBounds={[40, 70]} valueMax={100} />
                                            </Box>
                                        </Grid>
                                        <Grid size={{ xs: 6, md: 3 }} sx={{ height: '100%' }}>
                                            <Box sx={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                <HazardGauge title="낙상/쓰러짐 위험도" value={riskPercent.chamber_TAPO2} valueBounds={[40, 70]} valueMax={100} />
                                            </Box>
                                        </Grid>
                                    </Grid>

                                </CardContent>
                            </Card>
                        </Card>

                        <Card
                            sx={{
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            <CardHeader title="> 이벤트 로그 & 라이브뷰" />

                            <CardContent
                                sx={{
                                    flex: 1,
                                    minHeight: { xs: 200, sm: 0 }, // xs에서는 240px, sm 이상에서는 0
                                    maxHeight: { xs: 400, sm: 1000 }, // xs에서는 240px, sm 이상에서는 0
                                    p: 0.5,
                                }}
                            >
                                {/* LogPlayerCard가 sx를 받지 않으면 Box로 래핑 */}
                                <Box sx={{ height: '100%' }}>
                                    <LogPlayerCard
                                        site={site}
                                    // sx={{ height: '100%', overflow: 'auto' }}
                                    />
                                </Box>
                            </CardContent>
                        </Card>
                        <Card
                            sx={{
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            <CardHeader title="> 가스 센서 데이터" />

                            <CardContent
                                sx={{
                                    flex: 1,
                                    minHeight: { xs: 300, sm: 0 }, // xs에서는 240px, sm 이상에서는 0
                                    p: 0.5,
                                }}
                            >
                                {/* LogPlayerCard가 sx를 받지 않으면 Box로 래핑 */}
                                <Box sx={{ height: '100%' }}>
                                    <SensorLineChart site={site} sensorIds={["SM2"]} fields={["Temperature", "Humidity", "Gas(MQ-2)", "Gas(MQ-4)", "Std_Gas"]} />
                                </Box>
                            </CardContent>
                        </Card>

                    </Box>
                </Grid>
            </Grid>

            <Snackbar open={toast.open} autoHideDuration={2500} onClose={() => setToast(t => ({ ...t, open: false }))}>
                <Alert onClose={() => setToast(t => ({ ...t, open: false }))} severity={toast.severity} variant="filled">
                    {toast.msg}
                </Alert>
            </Snackbar>
        </Box>

    );
};

export default DGSPDashboard;