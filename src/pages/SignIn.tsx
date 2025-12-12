import { useEffect, useState, type FormEvent, useRef } from 'react';
import MuiCard from '@mui/material/Card';
import {
  Button, Stack, Box, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Snackbar, Alert, CircularProgress
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { ReactComponent as PIAILogo } from '@/assets/logos/piai_logo.svg';
import { initKakao, handleKakaoLogin } from '@/api/kakao';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const Card = styled(MuiCard)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignSelf: 'center',
  width: '100%',
  padding: theme.spacing(4),
  gap: theme.spacing(2),
  margin: 'auto',
  [theme.breakpoints.up('sm')]: { maxWidth: '450px' },
  boxShadow:
    'hsla(220, 30%, 5%, 0.05) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.05) 0px 15px 35px -5px',
  ...theme.applyStyles('dark', {
    boxShadow:
      'hsla(220, 30%, 5%, 0.5) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.08) 0px 15px 35px -5px',
  }),
}));

const SignInContainer = styled(Stack)(({ theme }) => ({
  padding: 20,
  '&::before': {
    content: '""',
    display: 'block',
    position: 'absolute',
    zIndex: -1,
    inset: 0,
    backgroundImage:
      'radial-gradient(ellipse at 50% 50%, hsl(210, 100%, 97%), hsl(0, 0%, 100%))',
    backgroundRepeat: 'no-repeat',
    ...theme.applyStyles('dark', {
      backgroundImage:
        'radial-gradient(at 50% 50%, hsla(210, 100%, 16%, 0.5), hsl(220, 30%, 5%))',
    }),
  },
}));


// 안전한 URL 빌더
function buildUrl(path: string) {
  const base = api.defaults.baseURL;
  try {
    return new URL(path).toString();
  } catch {
    if (!base) return path.startsWith('/') ? path : `/${path}`;
    const u = new URL(path, base.endsWith('/') ? base : `${base}/`);
    return u.toString();
  }
}

// 세션 준비 확인
async function ensureAuthIssued({
  tries = 12,
  intervalMs = 200,
  mePath = '/auth/me',
  refreshPath = '/auth/refresh',
}: {
  tries?: number; intervalMs?: number; mePath?: string; refreshPath?: string;
}) {
  const meUrl = buildUrl(mePath);
  const refreshUrl = buildUrl(refreshPath);

  for (let i = 0; i < tries; i++) {
    try {
      const res = await api.get(meUrl, {
        withCredentials: true,
      });
      if (res.status === 200) return true;
      if (i === 0 && refreshPath) {
        await api.post(refreshUrl, null, { withCredentials: true }).catch(() => { });
      }
    } catch { }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

export default function SignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refreshMe } = useAuth();

  const [openSignup, setOpenSignup] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ open: boolean; msg: string; type: 'success' | 'error' | 'info' }>({ open: false, msg: '', type: 'info' });
  const isMounted = useRef(true);

  useEffect(() => { isMounted.current = true; return () => { isMounted.current = false; }; }, []);
  useEffect(() => { initKakao(); }, []);
  useEffect(() => { if (params.get('signup') === '1') setOpenSignup(true); }, [params]);

  const handleLogoClick = () => window.open('https://piai.postech.ac.kr/', '_blank');

  const validatePhone = (v: string) => {
    const d = v.replace(/\D/g, '');
    if (d.length < 10 || d.length > 11) return '휴대폰 번호 10~11자리로 입력해 주세요.';
    return '';
  };

  const submitSignup = async () => {
    const err = validatePhone(phone);
    if (err) { setPhoneErr(err); return; }

    try {
      setBusy(true);

      // 1) 회원가입 (쿠키 세팅)
      await api.post('/auth/register', { phone: phone.replace(/\D/g, '') }, { withCredentials: true });

      // 2) 세션 준비 확인
      const ok = await ensureAuthIssued({ tries: 12, intervalMs: 200, mePath: '/auth/me', refreshPath: '/auth/refresh' });
      if (!ok) {
        if (!isMounted.current) return;
        setToast({ open: true, msg: '로그인 세션 준비가 지연됩니다. 잠시 후 다시 시도해 주세요.', type: 'error' });
        return;
      }

      // 3) 전역 인증 상태 갱신 → 가드 통과 보장
      await refreshMe();

      // 4) 여기서 토스트를 보여주고, 닫힐 때 /pending 이동
      if (!isMounted.current) return;
      setOpenSignup(false);
      setToast({ open: true, msg: '회원가입 및 로그인 완료', type: 'success' });
      navigate('/pending', { replace: true });

    } catch (e: any) {
      if (!isMounted.current) return;
      setToast({ open: true, msg: '회원가입 실패: ' + (e?.response?.data?.message || e?.message || ''), type: 'error' });
    } finally {
      if (isMounted.current) setBusy(false);
    }
  };

  const handleToastClose = () => {
    const wasSuccess = toast.type === 'success';
    setToast(prev => ({ ...prev, open: false }));
    if (wasSuccess) navigate('/pending', { replace: true });
  };

  const isDev = import.meta.env.MODE === "development";

  const handleDevLogin = async () => {
    if (!isDev) return; // 혹시 모를 안전장치

    try {
      setBusy(true);

      // 1) dev-login 호출해서 쿠키 세팅
      const res = await api.post('/auth/dev-login', null, {
        withCredentials: true,
      });
      console.log('dev-login res', res.status, res.data);

      // 2) 세션 준비 확인 (/auth/me가 200 뜰 때까지 잠깐 폴링)
      const ok = await ensureAuthIssued({
        tries: 12,
        intervalMs: 200,
        mePath: '/auth/me',
        refreshPath: '/auth/refresh',
      });

      if (!ok) {
        if (!isMounted.current) return;
        setToast({
          open: true,
          msg: 'dev 로그인 세션 준비가 지연됩니다. 잠시 후 다시 시도해 주세요.',
          type: 'error',
        });
        return;
      }

      // 3) 전역 인증 상태 갱신 → 라우트 가드에서 "로그인됨"으로 인식
      await refreshMe();

      // 4) 메인 페이지로 이동
      if (!isMounted.current) return;
      navigate('/main', { replace: true });
    } catch (err: any) {
      if (!isMounted.current) return;
      console.error('dev-login error:', err);
      setToast({
        open: true,
        msg:
          'dev 로그인 실패: ' +
          (err?.response?.data?.message || err?.message || ''),
        type: 'error',
      });
    } finally {
      if (isMounted.current) setBusy(false);
    }
  };



  return (
    <SignInContainer direction="column" justifyContent="space-between">
      <Stack sx={{ justifyContent: 'center', height: '80vh', p: 2 }}>
        <Card variant="outlined">
          <IconButton onClick={handleLogoClick}>
            <PIAILogo />
          </IconButton>
          <Box component="form" onSubmit={(e: FormEvent<HTMLFormElement>) => e.preventDefault()} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button type="button" fullWidth variant="contained" onClick={handleKakaoLogin}>
              카카오로 로그인 / 회원가입
            </Button>
            <Button type="button" fullWidth variant="outlined" onClick={() => navigate('/admin-login')}>
              관리자 로그인
            </Button>
            {isDev && (
              <button
                onClick={handleDevLogin}
                style={{ marginTop: 16, padding: "8px 12px", border: "1px solid #999" }}
              >
                개발용 로그인 (로컬 전용)
              </button>
            )}
          </Box>
        </Card>
      </Stack>

      <Dialog open={openSignup} onClose={() => setOpenSignup(false)}>
        <DialogTitle>휴대폰 번호 입력</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="휴대폰 번호 (- 없이)"
            fullWidth
            value={phone}
            onChange={(e) => { setPhone(e.target.value); if (phoneErr) setPhoneErr(''); }}
            error={!!phoneErr}
            helperText={phoneErr || '예: 01012345678'}
            inputMode="numeric"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenSignup(false)}>취소</Button>
          <Button onClick={submitSignup} variant="contained" disabled={busy}>
            {busy ? <CircularProgress size={18} /> : '제출'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={2500}
        onClose={handleToastClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.type} onClose={handleToastClose}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </SignInContainer>
  );
}
