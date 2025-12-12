export function initKakao() {
  if (typeof window === 'undefined') return;
  const Kakao = (window as any).Kakao;
  if (!Kakao) {
    console.error('Kakao SDK not loaded');
    return;
  }
  if (!Kakao.isInitialized?.()) {
    Kakao.init(import.meta.env.VITE_KAKAO_JS_KEY);
    console.log('Kakao initialized:', Kakao.isInitialized());
  }
}

export function handleKakaoLogin() {
  if (typeof window === 'undefined') return;
  const Kakao = (window as any).Kakao;
  if (!Kakao?.isInitialized?.()) {
    console.error('Kakao SDK not initialized');
    return;
  }

  const redirectUri = import.meta.env.VITE_KAKAO_REDIRECT_URI; // 백엔드 콜백
  if (!redirectUri) {
    console.error('VITE_KAKAO_REDIRECT_URI missing');
    return;
  }

  Kakao.Auth.authorize({
    redirectUri,
    scope: 'profile_nickname,account_email', // 필요한 범위만
    // state: crypto.getRandomValues(new Uint32Array(1))[0].toString(), // CSRF 방지용
  });
}