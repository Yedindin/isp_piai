export function isCellularLike(): boolean {
    const n = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    // effectiveType: 'slow-2g' | '2g' | '3g' | '4g'
    if (n?.effectiveType && ['slow-2g', '2g', '3g'].includes(n.effectiveType)) return true;
    // 셀룰러 타입 힌트
    if (n?.type && ['cellular'].includes(n.type)) return true;
    // iOS Safari는 지원이 약함 → UA로 대충 추정 (선택)
    // return /iPhone|Android/i.test(navigator.userAgent) && !navigator.onLine ? false : false;
    return false;
}