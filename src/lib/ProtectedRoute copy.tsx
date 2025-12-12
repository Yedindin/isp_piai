import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { api } from './api';
import { Box, CircularProgress } from '@mui/material';

const PENDING_ROLES = new Set(['pending', 'hold', 'user']);

export default function ProtectedRoute() {
  const { isAuthed, user, loading, refreshMe } = useAuth();
  const location = useLocation();

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (loading) return; // 전역 복구 끝난 뒤에만

      try {
        // 이미 인증 상태면 스킵(선택)
        if (isAuthed && user) return;

        const res = await api.get('/auth/me', {
          withCredentials: true,
        });
        if (!alive) return;

        if (res.status === 200) {
          await refreshMe();
        }
      } finally {
        if (alive) setChecking(false);
      }
    };

    run();
    return () => { alive = false; };
  }, [isAuthed, user, loading, refreshMe]);

  // 전역 복구 또는 1차 서버 판정 대기 중엔 스피너
  if (loading || checking) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  // 미인증 → 로그인 화면
  if (!isAuthed || !user) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  const isPendingRole = PENDING_ROLES.has(user.role ?? '');

  // pending-role이면 → /pending만 허용
  if (isPendingRole && location.pathname !== '/pending') {
    return <Navigate to="/pending" replace />;
  }

  // admin(=pending-role 아님)인데 현재 /pending이면 → /main으로 이동
  if (!isPendingRole && location.pathname === '/pending') {
    return <Navigate to="/main" replace />;
  }

  // 나머지는 통과
  return <Outlet />;
}
