// api.ts
import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? '',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// --- 전역(윈도우) 슬롯으로 인터셉터 ID 저장해 HMR 중복 방지 ---
declare global {
  interface Window {
    __API_RESP_INTERCEPTOR_ID__?: number;
  }
}

// 이전 인터셉터가 있으면 제거 (HMR 시 중요)
if (typeof window !== 'undefined' && window.__API_RESP_INTERCEPTOR_ID__ != null) {
  api.interceptors.response.eject(window.__API_RESP_INTERCEPTOR_ID__!);
}

// ---- refresh 동시성 제어: Promise 공유 방식 (waiters 배열 제거) ----
let refreshPromise: Promise<void> | null = null;

function isAuthEndpoint(url?: string) {
  if (!url) return false;
  return /\/auth\/(refresh|login|logout)(\b|\/|\?|#)/.test(url);
}

const id = api.interceptors.response.use(
  res => res,
  async (error: AxiosError) => {
    const response = error.response;
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean });

    if (!response || !original) throw error;
    if (response.status !== 401) throw error;

    // 루프 방지
    if (original._retry || isAuthEndpoint(original.url)) throw error;
    original._retry = true;

    try {
      // 이미 리프레시 진행 중이면 그 Promise만 대기
      if (!refreshPromise) {
        // 타임아웃으로 영원히 안 풀리는 대기 방지
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s 가드

        refreshPromise = api.post('/auth/refresh', undefined, { signal: controller.signal })
          .then(() => { })
          .finally(() => {
            clearTimeout(timeoutId);
            refreshPromise = null;
          });
      }
      await refreshPromise;
      // 리프레시가 끝나면 원 요청 재시도
      return api(original);
    } catch (e) {
      // 리프레시 실패 → 상태 초기화
      refreshPromise = null;
      throw e;
    }
  }
);

// 등록된 인터셉터 ID를 전역에 보관 (다음 HMR 사이클에서 eject)
if (typeof window !== 'undefined') {
  window.__API_RESP_INTERCEPTOR_ID__ = id;
}

// Vite HMR 종료 시점에도 안전하게 eject (선택)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    api.interceptors.response.eject(id);
    if (typeof window !== 'undefined' && window.__API_RESP_INTERCEPTOR_ID__ === id) {
      delete window.__API_RESP_INTERCEPTOR_ID__;
    }
  });
}