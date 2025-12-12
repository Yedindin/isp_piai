let inFlight = 0;
const queue: Array<() => void> = [];

// 동시에 시작할 수 있는 플레이어 수 (1~2 권장, 3 이상이면 이득이 급감)
const MAX_CONCURRENT_STARTS = 1;

// 다음 차례를 깨우는 내부 함수
function _drain() {
    if (inFlight >= MAX_CONCURRENT_STARTS) return;
    const next = queue.shift();
    if (next) next();
}

export function acquire(): Promise<() => void> {
    return new Promise((resolve) => {
        const tryStart = () => {
            if (inFlight < MAX_CONCURRENT_STARTS) {
                inFlight++;
                // release 함수: 내 차례 끝났을 때 호출
                const release = () => {
                    inFlight = Math.max(0, inFlight - 1);
                    _drain();
                };
                resolve(release);
            } else {
                queue.push(tryStart);
            }
        };
        tryStart();
    });
}

// 상황에 따라 동시 시작치를 바꾸고 싶다면 외부에서 노출
export function setMaxConcurrentStarts(n: number) {
    (globalThis as any).__HLS_MAX__ = n;
}