import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  Stack,
  Divider,
  CircularProgress,
  LinearProgress,
  Chip,
  Tooltip,
} from '@mui/material';
import LockClockIcon from '@mui/icons-material/LockClock';
import RefreshIcon from '@mui/icons-material/Refresh';
import LogoutIcon from '@mui/icons-material/Logout';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * Pending/approval page that polls the server for role changes.
 * - 이 컴포넌트는 절대 navigate하지 않습니다.
 * - 리다이렉트 규칙은 ProtectedRoute 단 한 곳에서만 처리하세요.
 */
export default function PendingPage({
  onRefresh,
  onLogout,
  onContact,
  email,
  pollMs = 10000,
}: {
  onRefresh?: () => void;
  onLogout?: () => void;
  onContact?: () => void;
  email?: string;
  pollMs?: number;
}) {
  const [seconds, setSeconds] = useState(0);
  const [role, setRole] = useState<string | null>(null); // 'pending' | 'hold' | 'user' | 'admin' 등
  const [checking, setChecking] = useState(false);

  const { logout, refreshMe } = useAuth();

  // 경과 시간 타이머
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = useMemo(() => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [seconds]);

  // role 확인 (표시만, 리다이렉트 금지)
  const fetchRole = async () => {
    try {
      setChecking(true);
      const { data } = await api.get('/auth/me', { withCredentials: true, validateStatus: () => true });
      if (data && (data.user?.role || data.role)) {
        setRole(data.user?.role ?? data.role);
      } else if (data?.status === 401) {
        // 401이면 ProtectedRoute가 리다이렉트 처리함. 여기선 표시만.
        setRole(null);
      }
      // 전역 Auth 동기화 (가드 판단이 최신을 보게끔)
      await refreshMe().catch(() => { });
    } finally {
      setChecking(false);
    }
  };

  // 최초 1회 + 주기적 폴링 (리다이렉트 없음)
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      await fetchRole();
    };
    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs]);

  // 버튼 핸들러
  const handleRefresh = () => (onRefresh ? onRefresh() : fetchRole());
  const handleLogout = async () => {
    try {
      if (onLogout) return onLogout();
      await logout(); // ProtectedRoute가 미인증을 감지해서 sign-in으로 보내줄 것
    } catch {
      // noop
    }
  };
  const handleContact = () => {
    if (onContact) return onContact();
    if (email) window.location.href = `mailto:${email}`;
  };

  const chipLabel = checking ? 'Checking…' : role ? `Role: ${role}` : 'Processing';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage:
          'linear-gradient(135deg, rgba(24,118,210,0.10) 0%, rgba(0,0,0,0.04) 40%, rgba(156,39,176,0.08) 100%)',
        p: 2,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={8}
          sx={{
            p: { xs: 3, sm: 4 },
            borderRadius: 4,
            backdropFilter: 'blur(3px)',
          }}
        >
          <Stack spacing={3} alignItems="center" textAlign="center">
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: '24px',
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                boxShadow: (t) => t.shadows[6],
              }}
            >
              <LockClockIcon fontSize="large" />
            </Box>

            <Stack spacing={1}>
              <Typography variant="h4" fontWeight={800}>
                관리자 승인 대기 중
              </Typography>
              <Typography variant="body1" color="text.secondary">
                계정 보안을 위해 관리자 확인이 필요합니다. 승인이 완료되면
                자동으로 메인 화면으로 이동합니다.
              </Typography>
            </Stack>

            <Box sx={{ width: '100%' }}>
              <LinearProgress sx={{ borderRadius: 999 }} />
              <Stack direction="row" justifyContent="space-between" mt={1}>
                <Typography variant="caption" color="text.secondary">
                  경과 시간 {elapsed}
                </Typography>
                <Tooltip title="시스템 상태 점검 중">
                  <Chip size="small" label={chipLabel} variant="outlined" />
                </Tooltip>
              </Stack>
            </Box>

            <Divider flexItem />

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ width: '100%' }}
            >
              <Button
                fullWidth
                variant="contained"
                startIcon={
                  checking ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <LockClockIcon />
                  )
                }
                disableElevation
                disabled
              >
                관리자 승인 중입니다
              </Button>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={handleRefresh}
                disabled={checking}
              >
                새로고침
              </Button>
            </Stack>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ width: '100%' }}
            >
              <Button
                fullWidth
                variant="text"
                startIcon={<HelpOutlineIcon />}
                onClick={handleContact}
              >
                문의하기 {email ? `(${email})` : ''}
              </Button>
              <Button
                fullWidth
                color="inherit"
                variant="text"
                startIcon={<LogoutIcon />}
                onClick={handleLogout}
              >
                로그아웃
              </Button>
            </Stack>

            <Typography variant="caption" color="text.disabled">
              보통 몇 분 이내에 처리가 완료됩니다. 장시간 대기 시 관리자에게
              문의해 주세요.
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
