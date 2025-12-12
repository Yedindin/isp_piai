// RealtimeLine.tsx
import React from 'react';
import ReactECharts from 'echarts-for-react';

type Point = [number, number]; // [time(ms), value]

type Props = {
    seriesKeys: string[];                  // ["SM2-Temperature", "SM2-Humidity", ...]
    fetchLatest: () => Promise<{           // 최신 포인트들 가져오기
        name: string;                        // seriesKeys 중 하나
        t: number | string | Date;           // timestamp (ms/ISO/Date)
        v: number;
    }[]>;
    windowMs?: number;                     // 보이는 구간 (기본 60s)
    delayMs?: number;                      // 지터 흡수 버퍼 (기본 3000ms)
    pollMs?: number;                       // 폴링 주기 (기본 500ms)
};

const COLORS = ['#4bc0c0', '#ff6384', '#ffce56', '#36a2eb', '#9966ff', '#ff9f40'];

function toMs(x: number | string | Date) {
    if (x instanceof Date) return x.getTime();
    if (typeof x === 'number') return x > 1e12 ? x : x * 1000;
    const d = new Date(x);
    const t = +d;
    return Number.isFinite(t) ? t : Date.now();
}

const RealtimeLine: React.FC<Props> = ({
    seriesKeys,
    fetchLatest,
    windowMs = 60_000,
    delayMs = 3_000,
    pollMs = 500,
}) => {
    const ref = React.useRef<ReactECharts>(null);
    const lastTs = React.useRef<Record<string, number>>({});
    const inflight = React.useRef(false);

    // 초기 옵션
    const option = React.useMemo(() => {
        const series = seriesKeys.map((name, i) => ({
            id: name,
            name,
            type: 'line' as const,
            showSymbol: false,
            smooth: 0.25,
            lineStyle: { width: 2 },
            itemStyle: { color: COLORS[i % COLORS.length] },
            data: [] as Point[],
            // 성능 튜닝 (모바일용)
            large: true, largeThreshold: 2000, progressive: 400, progressiveThreshold: 3000,
        }));
        const now = Date.now();
        return {
            useUTC: false,
            animation: false,
            color: COLORS,
            grid: { left: 40, right: 16, top: 24, bottom: 32, containLabel: true },
            tooltip: { trigger: 'axis' },
            legend: { type: 'scroll' as const },
            xAxis: {
                type: 'time' as const,
                boundaryGap: false,
                min: now - windowMs, max: now,
                axisLabel: { hideOverlap: true },
            },
            yAxis: { type: 'value' as const, name: 'Value' },
            dataZoom: [
                { type: 'inside' as const, throttle: 50 },     // 터치 슬라이드/핀치
                { type: 'slider' as const, height: 16 },
            ],
            series,
        };
    }, [seriesKeys.join('|'), windowMs]);

    // 창 슬라이드
    const slide = React.useCallback(() => {
        const ins = ref.current?.getEchartsInstance();
        if (!ins) return;
        const end = Date.now() - delayMs;
        const start = end - windowMs;
        ins.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, startValue: start, endValue: end });
    }, [delayMs, windowMs]);

    // 폴링 + appendData
    React.useEffect(() => {
        let timer: number | null = null;

        const tick = async () => {
            if (document.hidden || inflight.current) return;
            inflight.current = true;
            try {
                const rows = await fetchLatest();
                const ins = ref.current?.getEchartsInstance();
                if (!ins) return;

                const optSeries = ins.getOption().series as any[]; // 현재 시리즈들
                let pushed = false;

                for (const r of rows) {
                    const name = r.name;
                    const idx = optSeries.findIndex(s => s.name === name);
                    if (idx < 0) continue;

                    const t = toMs(r.t);
                    if (t > (lastTs.current[name] ?? -Infinity)) {
                        ins.appendData({ seriesIndex: idx, data: [[t, r.v]] });
                        lastTs.current[name] = t;
                        pushed = true;
                    }
                }
                if (pushed) slide();
            } finally {
                inflight.current = false;
            }
        };

        timer = window.setInterval(tick, pollMs);
        tick(); // 즉시 1회
        return () => { if (timer) window.clearInterval(timer); };
    }, [fetchLatest, pollMs, slide]);

    return (
        <ReactECharts
            ref={ref}
            option={option}
            style={{ width: '100%', height: '100%' }}
            opts={{
                renderer: 'canvas',
                devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2), // 모바일 과도한 DPR 억제
            }}
            notMerge
            lazyUpdate
        />
    );
};

export default RealtimeLine;
