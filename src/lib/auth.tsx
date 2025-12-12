// src/lib/auth.tsx

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "./api";

type User =
  | {
    id: string;
    nickname?: string;
    picture?: string;
    role?: "pending" | "hold" | "user" | "admin" | string;
  }
  | null;

type Ctx = {
  user: User;
  loading: boolean;
  isAuthed: boolean;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  user: null,
  loading: true,
  isAuthed: false,
  refreshMe: async () => { },
  logout: async () => { },
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const signingOutRef = useRef(false);

  // 강제 로그아웃 (인터셉터에서 사용)
  const hardSignOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    try {
      try {
        await api.post("/auth/logout", null, { withCredentials: true });
      } catch {
        // 쿠키 없어도 상관 없음
      }
      setUser(null);
    } finally {
      signingOutRef.current = false;
    }
  };

  // 401 -> /auth/refresh -> 재시도 인터셉터
  useEffect(() => {
    let isRefreshing = false;
    let waitQueue: Array<(ok: boolean) => void> = [];

    const subscribe = (cb: (ok: boolean) => void) => {
      waitQueue.push(cb);
    };

    const notifyAll = (ok: boolean) => {
      waitQueue.forEach((cb) => cb(ok));
      waitQueue = [];
    };

    const id = api.interceptors.response.use(
      (res) => res,
      async (error) => {
        const status = error?.response?.status;
        const originalConfig = error?.config || {};
        const url: string | undefined = originalConfig.url;


        // axios에서 url은 baseURL 포함/미포함 둘 다 가능 → 부분매칭
        const isBypassAuth =
          !!url &&
          /\/auth\/(kakao-login|logout|refresh|register|unlink)(\/|\?|#|$)/.test(
            url
          );
        // /auth/me 는 "bypass 아님" → refresh 대상
        // 즉, 401이 나면 refresh 시도하게 놔둠
        console.log("AAA")
        console.log("BBB")
        console.log(error)
        console.log(status)

        if (status === 401 && !isBypassAuth) {
          // 무한루프 방지: 이미 한 번 재시도한 요청이면 로그아웃
          console.log("BBB")
          if ((originalConfig as any)._retry) {
            await hardSignOut();
            return Promise.reject(error);
          }
          (originalConfig as any)._retry = true;

          // 이미 다른 refresh 진행 중이면 거기에 조인
          if (isRefreshing) {
            console.log("CCC")
            const ok = await new Promise<boolean>((resolve) => {
              subscribe(resolve);
            });
            if (!ok) {
              return Promise.reject(error);
            }
            return api(originalConfig);
          }

          // 여기서 refresh 리더 시작
          isRefreshing = true;
          console.log("DDD")
          try {
            // 1) refresh 토큰으로 access 재발급
            await api.post("/auth/refresh", null, {
              withCredentials: true,
            });
            console.log("EEE")

            // me 다시 쳐서 상태 동기화 시도 (실패해도 원요청은 재시도)
            try {
              const { data } = await api.get("/auth/me", {
                withCredentials: true,
              });
              const u =
                data && "user" in data
                  ? data.user
                  : data?.authenticated
                    ? data.user
                    : null;
              if (u) {
                setUser(u);
              }
            } catch {
              // me 실패해도 일단 패스 (원 요청 결과로 다시 판단)
            }

            isRefreshing = false;
            notifyAll(true);

            // 3) 원래 요청 재시도
            return api(originalConfig);
          } catch (refreshErr) {
            isRefreshing = false;
            notifyAll(false);
            await hardSignOut();
            return Promise.reject(refreshErr);
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.response.eject(id);
    };
  }, []);

  // 초기 /auth/me 체크 (여기서도 refresh 인터셉터가 작동함)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/auth/me", {
          withCredentials: true,
        });
        const u =
          data && "user" in data
            ? data.user
            : data?.authenticated
              ? data.user
              : null;
        setUser(u);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 외부에서 강제 me
  const refreshMe = async () => {
    const { data } = await api.get("/auth/me", {
      withCredentials: true,
    });
    const u =
      data && "user" in data
        ? data.user
        : data?.authenticated
          ? data.user
          : null;
    setUser(u);
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout", null, {
        withCredentials: true,
      });
    } finally {
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthed: !!user,
      refreshMe,
      logout,
    }),
    [user, loading]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);
