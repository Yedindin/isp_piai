import { useEffect, useMemo, useRef, useState } from 'react';
// @ts-ignore
import { EventSourcePolyfill } from 'event-source-polyfill';

export type AlertMsg = {
    type: 'alert_open' | 'alert_close';
    id: string;
    title: string;
    site: string;
    model: string;
    sensor_id: string;
    value?: number;
    started_at?: string;
    ended_at?: string | null;
    status?: 'open' | 'acked' | 'closed';
    filename_l?: string | null;
    filename_s?: string | null;
};

export type UseAlertStreamOptions = {
    /*필수: 구독할 사이트 */
    site: string;
    /* 기본: `${VITE_API_BASE}/alerts/stream` */
    url?: string;
    /* 기본: true (크로스도메인 쿠키 전송) */
    withCredentials?: boolean;
    /* 필요시 Authorization 등 커스텀 헤더 */
    headers?: Record<string, string>;
    /* 기본: 120_000 ms */
    heartbeatTimeout?: number;
    /* 수신 이벤트 콜백 */
    onEvent?: (evt: AlertMsg) => void;
};

type ReadyState = 'CONNECTING' | 'OPEN' | 'CLOSED';

function buildURL(baseUrl: string, params: Record<string, string | undefined>) {
    const u = new URL(baseUrl, window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') u.searchParams.set(k, v);
    });
    return u.toString();
}

export function useAlertStreamCORS(opts: UseAlertStreamOptions) {
    const base = import.meta.env.VITE_API_BASE ?? '';
    const defaultUrl = useMemo(() => {
        const raw = `${base}/alerts/stream`;
        return raw.replace(/([^:]\/)\/+/g, '$1');
    }, [base]);

    const streamBaseUrl = opts.url ?? defaultUrl;
    const withCredentials = opts.withCredentials ?? true;
    const heartbeatTimeout = opts.heartbeatTimeout ?? 120_000;

    const esRef = useRef<InstanceType<typeof EventSourcePolyfill> | null>(null);
    const [connected, setConnected] = useState(false);
    const [ready, setReady] = useState<ReadyState>('CONNECTING');
    const [lastEvent, setLastEvent] = useState<AlertMsg | null>(null);
    const [error, setError] = useState<unknown>(null);

    // 최신 onEvent 보존
    const onEventRef = useRef<((e: AlertMsg) => void) | undefined>(opts.onEvent);
    useEffect(() => {
        onEventRef.current = opts.onEvent;
    }, [opts.onEvent]);

    // Last-Event-ID 저장
    const lastIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!opts.site) return; // site 없으면 연결 안 함

        // Last-Event-ID는 헤더로 보냄
        const headers = { ...(opts.headers || {}) };
        if (lastIdRef.current) {
            headers['Last-Event-ID'] = lastIdRef.current;
        }

        // site를 쿼리로 전달 (예: /alerts/stream?site=DGSP)
        // 필요하면 last_event_id도 쿼리로 함께 전달 가능:
        const streamUrl = buildURL(streamBaseUrl, {
            site: opts.site,
            // last_event_id: lastIdRef.current || undefined,
        });

        const es = new EventSourcePolyfill(streamUrl, {
            withCredentials,
            headers,
            heartbeatTimeout,
        }) as InstanceType<typeof EventSourcePolyfill>;

        esRef.current = es;
        setError(null);
        setReady('CONNECTING');

        es.onopen = () => {
            setConnected(true);
            setReady('OPEN');
        };

        const handleAny = (ev: MessageEvent) => {
            try {
                // polyfill은 lastEventId 지원
                lastIdRef.current = (ev as any).lastEventId ?? lastIdRef.current;
                const data = JSON.parse(ev.data) as AlertMsg;
                // site 필터가 서버에서 되어도, 혹시 몰라서 클라에서도 한번 더 확인 가능:
                if (!data?.site || data.site === opts.site) {
                    setLastEvent(data);
                    onEventRef.current?.(data);
                }
            } catch {
                /* parse 실패는 스킵 */
            }
        };

        // 기본 메시지 + 네임드 이벤트 모두 같은 핸들러로
        es.onmessage = handleAny as any;
        es.addEventListener('alert_open', handleAny as any);
        es.addEventListener('alert_close', handleAny as any);

        es.onerror = (e: unknown) => {
            setConnected(false);
            setReady('CONNECTING');
            setError(e);
            // 자동 재연결은 polyfill이 수행
        };

        return () => {
            es.close();
            esRef.current = null;
            setConnected(false);
            setReady('CLOSED');
        };
        // site가 바뀌면 재연결, headers/timeout도 반영
    }, [
        streamBaseUrl,
        withCredentials,
        heartbeatTimeout,
        JSON.stringify(opts.headers),
        opts.site,
    ]);

    const close = () => {
        esRef.current?.close();
        esRef.current = null;
        setConnected(false);
        setReady('CLOSED');
    };

    return { connected, ready, lastEvent, error, close };
}

export default useAlertStreamCORS;