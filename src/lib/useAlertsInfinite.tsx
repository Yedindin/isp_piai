// useAlertsInfinite.ts
import * as React from 'react';
import { DateTime } from 'luxon';
import { api } from '@/lib/api';
import type { LogEvent } from '@/components/dashboard/cards/LogPlayerCard';
import type { ServerAlert } from '@/lib/types';
import { mapServerAlertToLogEvent } from '@/lib/types';

export type UseAlertsInfiniteOptions = {
    site: string;
    pageSize?: number;
    // 서버 사이드 정렬/필터/검색
    order?: 'asc' | 'desc';                 // 기본 desc
    from?: string | null;                   // ISO (since)
    to?: string | null;                     // ISO (until)
    keyword?: string;                       // 제목 검색(백엔드가 지원하면 사용)
    severities?: Array<LogEvent['severity']>;
    hasVideoOnly?: boolean;
    model?: string;
    sensor_id?: string;
};


export function useAlertsInfinite(opts: UseAlertsInfiniteOptions) {
    const {
        site,
        pageSize = 20,
        order = 'desc',
        from,
        to,
        keyword,
        severities,
        hasVideoOnly,
        model,
        sensor_id,
    } = opts;


    const [items, setItems] = React.useState<LogEvent[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [hasMore, setHasMore] = React.useState(true);

    // 커서: desc → until 기준, asc → since 기준
    const cursorRef = React.useRef<string | null>(null);
    const dedup = React.useRef<Set<string>>(new Set());

    const reset = React.useCallback(() => {
        setItems([]);
        setHasMore(true);
        setError(null);
        dedup.current.clear();
        cursorRef.current = null;
    }, []);

    const fetchNext = React.useCallback(async () => {
        if (loading || !hasMore) return;
        setLoading(true);
        setError(null);
        try {
            const params: any = {
                site,
                limit: pageSize,
                order, // 'asc' | 'desc' 서버에 그대로 전달
            };

            // 초기 범위 필터
            if (from) params.since = from;
            if (to) params.until = to;

            // 커서 적용
            if (cursorRef.current) {
                if (order === 'desc') {
                    const ms = DateTime.fromISO(cursorRef.current).toMillis() - 1;
                    params.until = DateTime.fromMillis(ms).toUTC().toISO();
                    delete params.since;              // ← 충돌 방지
                    // 필터에서 to가 넘어왔으면 비활성화(페이지네이션 중엔 커서가 우선)
                    delete params.to;
                } else {
                    const ms = DateTime.fromISO(cursorRef.current).toMillis() + 1;
                    params.since = DateTime.fromMillis(ms).toUTC().toISO();
                    delete params.until;              // 충돌 방지
                    // 필터에서 from은 유지 가능, to는 보통 제거(최신으로 계속 확장)
                    delete params.to;
                }
            }

            // 추가 필터/검색(백엔드가 지원하는 경우에 한해 사용)
            if (model) params.model = model;
            if (sensor_id) params.sensor_id = sensor_id;
            if (keyword && keyword.trim()) params.keyword = keyword.trim();
            if (Array.isArray(severities) && severities.length > 0) {
                params.severities = severities.join(','); // 예: "info,warn"
            }
            if (hasVideoOnly) params.has_video = '1';

            const res = await api.get('data/log/alert', { params });
            const list: ServerAlert[] = res.data?.alerts ?? [];

            const mapped = list
                .map(mapServerAlertToLogEvent)
                .filter(ev => {
                    if (dedup.current.has(ev.id)) return false;
                    dedup.current.add(ev.id);
                    return true;
                });

            // DESC면 “과거로” 스크롤이므로 append, ASC도 서버가 오름차순으로 주므로 append OK
            setItems(prev => [...prev, ...mapped]);

            // 다음 커서: 마지막 아이템의 timestamp를 저장
            const last = mapped[mapped.length - 1] ?? null;
            console.log(mapped.length - 1)
            console.log(last)
            if (last) cursorRef.current = last.timestamp;

            if (list.length < pageSize) setHasMore(false);

            console.log(mapped)

            console.log('[alerts] order:', order,
                'cursor:', cursorRef.current,
                'params.since:', params.since,
                'params.until:', params.until,
                'from:', from, 'to:', to);
        } catch (e: any) {
            setError(e?.message ?? 'failed to load');
        } finally {
            setLoading(false);
        }
    }, [loading, hasMore, site, pageSize, order, from, to, keyword, severities, hasVideoOnly, model, sensor_id]);

    // 의존 파라미터 변동 시 reset + 첫 페이지
    React.useEffect(() => {
        reset();
        // 첫 페이지 자동 로드
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        fetchNext();
    }, [site, order, from, to, keyword, JSON.stringify(severities ?? []), hasVideoOnly, model, sensor_id, reset]); // fetchNext는 내부에서 참조하므로 생략



    return { items, loading, error, hasMore, fetchNext, reset };
}