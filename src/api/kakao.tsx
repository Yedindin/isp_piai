// export function initKakao() {
//   if (typeof window === 'undefined') return;
//   const Kakao = (window as any).Kakao;
//   if (!Kakao) {
//     console.error('Kakao SDK not loaded');
//     return;
//   }
//   if (!Kakao.isInitialized?.()) {
//     Kakao.init(import.meta.env.VITE_KAKAO_JS_KEY);
//     console.log('Kakao initialized:', Kakao.isInitialized());
//   }
// }

// export function handleKakaoLogin() {
//   if (typeof window === 'undefined') return;
//   const Kakao = (window as any).Kakao;
//   if (!Kakao?.isInitialized?.()) {
//     console.error('Kakao SDK not initialized');
//     return;
//   }

//   const redirectUri = import.meta.env.VITE_KAKAO_REDIRECT_URI; // 백엔드 콜백
//   if (!redirectUri) {
//     console.error('VITE_KAKAO_REDIRECT_URI missing');
//     return;
//   }

//   Kakao.Auth.authorize({
//     redirectUri,
//     scope: 'profile_nickname, profile_image, talk_message', // 필요한 범위만
//     // state: crypto.getRandomValues(new Uint32Array(1))[0].toString(), // 원하면 CSRF 방지용
//   });
// }

// api/kakao.ts
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

/**
 * 백엔드 redirectUri로 이동시키는 OAuth authorize
 * 백엔드 콜백에서:
 * - 기존 유저: 세션 쿠키 발급 후 '/'로 302
 * - 신규 유저: signup_token 쿠키 발급 후 '/sign-in?signup=1'로 302
 */
export function handleKakaoLogin() {
  if (typeof window === 'undefined') return;
  const Kakao = (window as any).Kakao;
  if (!Kakao?.isInitialized?.()) {
    console.error('Kakao SDK not initialized');
    return;
  }

  const redirectUri = import.meta.env.VITE_KAKAO_REDIRECT_URI; // 백엔드 콜백 주소
  if (!redirectUri) {
    console.error('VITE_KAKAO_REDIRECT_URI missing');
    return;
  }

  // state는 선택(리다이렉트 후 출처 검증용)
  const state = crypto.getRandomValues(new Uint32Array(1))[0].toString();

  Kakao.Auth.authorize({
    redirectUri,
    scope: 'profile_nickname, profile_image, talk_message',
    state,
    // prompt: 'select_account', // 필요 시 계정 선택 강제
  });
}
