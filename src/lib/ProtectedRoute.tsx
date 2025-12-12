// src/lib/ProtectedRoute.tsx

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "./auth";

const PENDING_ROLES = new Set(["pending", "hold", "user"]);

export default function ProtectedRoute() {
  const { isAuthed, user, loading } = useAuth();
  const location = useLocation();

  // 아직 초기 /auth/me 체크 중이면 스피너
  if (loading) {
    return (
      <Box
        sx={{
          p: 4,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // 미인증 → 로그인 페이지로
  if (!isAuthed || !user) {
    return (
      <Navigate
        to="/sign-in"
        replace
        state={{ from: location }}
      />
    );
  }

  const isPendingRole = PENDING_ROLES.has(user.role ?? "");

  // pending/hold/user → /pending만 허용
  if (isPendingRole && location.pathname !== "/pending") {
    return <Navigate to="/pending" replace />;
  }

  // admin 등 확정 권한인데 /pending에 머물러 있다면 메인으로 보냄
  if (!isPendingRole && location.pathname === "/pending") {
    return <Navigate to="/main" replace />;
  }

  // 나머지는 통과
  return <Outlet />;
}
