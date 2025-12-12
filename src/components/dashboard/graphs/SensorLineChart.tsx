// SensorLineChart.tsx
import React from 'react';
import { Box } from '@mui/material';
import { Line } from 'react-chartjs-2';
import {
    type ChartData,
    type ChartDataset,
    type ChartOptions,
} from 'chart.js/auto';
import 'chartjs-adapter-luxon';
import { DateTime } from 'luxon';
import { api } from '@/lib/api';

type SensorLineChartProps = {
    site: string;
    fields: string[];
    sensorIds: string[];
    pollMs?: number;          // 기본 1000
    startImmediate?: boolean; // 기본 false
};

type XYPoint = { x: number | string | Date; y: number };
type ServerRow = { sensor_id: string; field: string; timestamp: string | number | Date; value: number };

const COLORS = [
    'rgba(75,192,192,1)',
    'rgba(255,99,132,1)',
    'rgba(255,206,86,1)',
    'rgba(54,162,235,1)',
    'rgba(153,102,255,1)',
    'rgba(255,159,64,1)',
];

const toMs = (t: string | number | Date): number => {
    if (t instanceof Date) return t.getTime();
    if (typeof t === 'number') {
        if (t < 1e11) return t * 1000;            // sec → ms
        if (t < 1e14) return t;                   // ms
        if (t < 1e17) return Math.floor(t / 1e3); // µs → ms
        return Math.floor(t / 1e6);               // ns → ms
    }
    const n = Number(t);
    if (!Number.isNaN(n)) return toMs(n);
    const iso = DateTime.fromISO(t);
    if (iso.isValid) return iso.toMillis();
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? Date.now() : d.getTime();
};

const MAX_POINTS_PER_SERIES = 1200; // 안전 상한(예: 초당 20Hz로 1분치)

const SensorLineChart: React.FC<SensorLineChartProps> = ({
    site,
    fields,
    sensorIds,
    pollMs = 1000,
    startImmediate = false,
}) => {
    const fieldsKey = React.useMemo(() => fields.join('|'), [fields]);
    const sensorIdsKey = React.useMemo(() => sensorIds.join('|'), [sensorIds]);

    // ── datasets 정의 (label 고정) ─────────────────────────────────────────────
    const datasetsRef = React.useRef<ChartDataset<'line', XYPoint[]>[]>([]);

    React.useEffect(() => {
        const next: ChartDataset<'line', XYPoint[]>[] = [];

        sensorIds.forEach((sensorId, i) => {
            fields.forEach((field, j) => {
                const colorIdx = (i * fields.length + j) % COLORS.length;
                const label = `${sensorId}-${field}`;
                next.push({
                    label,
                    data: [],
                    borderColor: COLORS[colorIdx],
                    fill: false,
                    pointRadius: 0,
                    tension: 0.2,
                });
            });
        });

        datasetsRef.current = next;
    }, [sensorIdsKey, fieldsKey]);

    const [chartData, setChartData] = React.useState<ChartData<'line', XYPoint[]>>({
        datasets: datasetsRef.current,
    });

    const inflightRef = React.useRef(false);

    // ── 폴링: setInterval 기반, 단순/견고 ──────────────────────────────────────
    React.useEffect(() => {
        let destroyed = false;

        const fetchOnce = async () => {
            if (destroyed) return;
            if (inflightRef.current) return;

            // 탭 비가시 상태면 스킵 (루프는 유지)
            if (document.visibilityState !== 'visible') return;

            inflightRef.current = true;

            try {
                const res = await api.get<ServerRow[]>('/data/sensor_data/graph', {
                    params: {
                        site,
                        sensor_ids: sensorIds,
                        field: fields,
                        start: '-1m',
                    },
                    // api가 axios라면 timeout 사용, fetch라면 이 옵션 빼기
                    timeout: pollMs * 0.8,
                });

                const grouped: Record<string, XYPoint[]> = {};

                for (const r of res.data) {
                    const key = `${r.sensor_id}-${r.field}`;
                    (grouped[key] ??= []).push({
                        x: toMs(r.timestamp),
                        y: r.value,
                    });
                }

                for (const k of Object.keys(grouped)) {
                    const arr = grouped[k];
                    arr.sort((a, b) => Number(a.x) - Number(b.x));
                    if (arr.length > MAX_POINTS_PER_SERIES) {
                        grouped[k] = arr.slice(-MAX_POINTS_PER_SERIES);
                    }
                }

                const nextDatasets = datasetsRef.current.map((ds) => {
                    const label = ds.label ?? '';
                    const series = grouped[label];
                    if (series && series.length) {
                        return { ...ds, data: series };
                    }
                    return { ...ds };
                });

                datasetsRef.current = nextDatasets;

                setChartData((prev) => ({
                    ...prev,
                    datasets: nextDatasets,
                }));
            } catch (e: any) {
                // 여기서도 무조건 루프는 계속 돎
                if (
                    e?.name !== 'AbortError' &&
                    e?.name !== 'CanceledError'
                ) {
                    console.error('[SensorLineChart] fetch error:', e);
                }
            } finally {
                inflightRef.current = false;
            }
        };

        if (startImmediate) {
            void fetchOnce();
        }

        const intervalId = window.setInterval(() => {
            void fetchOnce();
        }, pollMs);

        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                void fetchOnce();
            }
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            destroyed = true;
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [site, sensorIdsKey, fieldsKey, pollMs, startImmediate, fields, sensorIds]);

    // ── Chart 옵션 ────────────────────────────────────────────────────────────
    const options = React.useMemo<ChartOptions<'line'>>(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            parsing: false,
            normalized: true,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'second', tooltipFormat: 'MMM dd, HH:mm:ss' },
                    title: { display: true, text: 'Time' },
                },
                y: {
                    title: { display: true, text: 'Value' },
                },
            },
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12 },
                },
                tooltip: { intersect: false },
                decimation: {
                    enabled: true,
                    algorithm: 'min-max',
                    samples: 250,
                },
            },
        }),
        [],
    );

    return (
        <Box sx={{ height: '100%', width: '100%' }}>
            <Line data={chartData} options={options} style={{ height: '100%', width: '100%' }} />
        </Box>
    );
};

export default SensorLineChart;
