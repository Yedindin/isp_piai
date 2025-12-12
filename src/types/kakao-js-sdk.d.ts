export {}

declare global {
  interface KakaoLoginSuccess {
    access_token: string
    token_type?: string
    expires_in?: number
    refresh_token?: string
    scope?: string
  }
  
  declare global {
  interface Window {
    Kakao?: {
      init(appKey: string): void;
      isInitialized(): boolean;
      Auth: {
        login(opts: any): void;
        logout(cb?: () => void): void;
        getAccessToken(): string | null;
      };
      // 필요한 부분만 추가로 선언
    };
  }
}

  interface Window {
    Kakao?: {
      init(appKey: string): void
      isInitialized(): boolean
      Auth: {
        login(opts: {
          scope?: string
          success?: (res: KakaoLoginSuccess) => void
          fail?: (err: unknown) => void
        }): void
        authorize(options: { redirectUri: string; scope?: string; state?: string }): void;
        logout?: (cb?: () => void) => void
      }
      API?: {
        request<T = unknown>(opts: { url: string; data?: any }): Promise<T>
      }
      Share?: unknown
    }
  }
}