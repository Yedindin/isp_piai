// pages/MainPage.tsx
import { useEffect, useRef, useState, useMemo } from 'react';
import type { MouseEvent } from 'react';
import {
    Box, AppBar, Toolbar, IconButton, Badge, Typography, Menu, MenuItem, Divider, ListItemIcon,
    Paper, Stack, Button, CircularProgress
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircle from '@mui/icons-material/AccountCircle';
import MailIcon from '@mui/icons-material/Mail';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import TuneRounded from '@mui/icons-material/TuneRounded';

import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

import SelectDashboard from '@/components/main_page/app_bar/SelectDashboard';
import DSGPDashboard from '@/components/dashboard/DSGPDashboard';
import { AlertCenterProvider } from '@/components/dashboard/alerts/AlertsCenter';

type MeResponse = {
    role?: string;
    user?: { role?: string; sites?: Record<string, string> };
    sites?: Record<string, string>;
};

const DEFAULT_KEY = '__default__';
const DEFAULT_LABEL = '기본 대시보드';

export default function MainPage() {
    const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);       // 계정 메뉴
    const menuOpen = Boolean(menuAnchorEl);
    const [ctrlAnchorEl, setCtrlAnchorEl] = useState<null | HTMLElement>(null);       // ✅ 헤더 컨트롤 메뉴(새로 추가)
    const ctrlOpen = Boolean(ctrlAnchorEl);

    const navigate = useNavigate();
    const { logout } = useAuth();

    // ROLE
    const [role, setRole] = useState<string | null>(null);

    // sites: { key: label } 관리
    const [siteMap, setSiteMap] = useState<Record<string, string>>({});
    const siteEntries = useMemo(() => Object.entries(siteMap), [siteMap]); // [ [key, label], ... ]
    const siteLabels = useMemo(() => siteEntries.map(([, label]) => label), [siteEntries]);
    const hasSites = siteEntries.length > 0;

    // 선택 상태: 사용자 노출값(라벨)과 내부 분기값(키)을 분리
    const [selectedKey, setSelectedKey] = useState<string>('');
    const [selectedLabel, setSelectedLabel] = useState<string>('');

    const [dashLoading, setDashLoading] = useState<boolean>(true);
    const [dashError, setDashError] = useState<string>('');
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // label -> key 역매핑
    const labelToKey = (label: string) => {
        const found = siteEntries.find(([, v]) => v === label);
        return found ? found[0] : '';
    };

    // 내 role 가져오기
    const fetchRole = async () => {
        try {
            const { data } = await api.get<MeResponse>('/auth/me', {
                withCredentials: true,
            });
            const r = data?.user?.role ?? data?.role ?? null;
            setRole(r);
            return r;
        } catch {
            setRole(null);
            return null;
        }
    };

    // 사이트 목록 가져오기 (role 포함)
    const fetchSites = async (opts?: { force?: boolean }) => {
        if (!opts?.force && dashLoading) return;

        setDashLoading(true);
        setDashError('');

        try {
            // role이 없으면 먼저 확보
            let currentRole = role;
            if (!currentRole) {
                currentRole = await fetchRole();
            }

            // role을 쿼리로 붙여 요청
            const { data } = await api.get<MeResponse>('/resource/site_names', {
                withCredentials: true,
                params: currentRole ? { role: currentRole } : undefined,
            });
            const sites = (data?.user?.sites ?? data?.sites ?? {}) as Record<string, string>;
            const entries = Object.entries(sites);

            if (entries.length === 0) {
                // 사이트가 없으면 기본 페이지로 고정
                setSiteMap({});
                setSelectedKey(DEFAULT_KEY);
                setSelectedLabel(DEFAULT_LABEL);
                setDashLoading(false);
                if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
                return;
            }

            // 사이트가 있으면 정상 세팅
            setSiteMap(sites);

            if (!selectedKey || selectedKey === DEFAULT_KEY) {
                const [firstKey, firstLabel] = entries[0];
                setSelectedKey(firstKey);
                setSelectedLabel(firstLabel);
            } else if (selectedLabel) {
                const k = labelToKey(selectedLabel);
                if (!k && entries.length > 0) {
                    const [firstKey, firstLabel] = entries[0];
                    setSelectedKey(firstKey);
                    setSelectedLabel(firstLabel);
                } else if (k && k !== selectedKey) {
                    setSelectedKey(k);
                }
            }

            setDashLoading(false);
            if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
        } catch {
            setDashError('대시보드 목록을 불러오지 못했습니다. 5초 후 다시 시도합니다.');
            setDashLoading(true);
            if (retryTimer.current) clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(() => fetchSites({ force: true }), 5000);
        }
    };

    // 초기 진입: role→sites 순서로, 성공할 때까지 sites 재시도
    useEffect(() => {
        fetchSites({ force: true });
        return () => {
            if (retryTimer.current) {
                clearTimeout(retryTimer.current);
                retryTimer.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // role 변경 시 목록을 다시 조회
    useEffect(() => {
        if (role) {
            fetchSites({ force: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role]);

    // 셀렉트 변경(라벨) -> key 동기화
    const handleSelectChange = (nextLabel: string) => {
        setSelectedLabel(nextLabel);
        const key = labelToKey(nextLabel);
        if (key) setSelectedKey(key);
    };

    // 메뉴 핸들러들
    const handleMenuOpen = (e: MouseEvent<HTMLElement>) => setMenuAnchorEl(e.currentTarget);
    const handleMenuClose = () => setMenuAnchorEl(null);

    const handleCtrlOpen = (e: MouseEvent<HTMLElement>) => {
        setCtrlAnchorEl(e.currentTarget);
        // 메뉴를 열 때 최신 목록이 필요한 경우 갱신
        fetchSites({ force: true });
    };
    const handleCtrlClose = () => setCtrlAnchorEl(null);

    const handleLogout = async () => {
        try {
            await logout();
        } finally {
            handleMenuClose();
            navigate('/sign-in', { replace: true });
        }
    };

    //  기본(사이트 없음) 랜딩 UI
    const DefaultLanding = (
        <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 2 }}>
            <Paper sx={{ p: 3, borderRadius: 3, textAlign: 'center', minWidth: 320 }}>
                <Stack spacing={2} alignItems="center">
                    <Typography variant="h5" fontWeight={700}>{DEFAULT_LABEL}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        아직 할당된 사업장이 없습니다. 관리자에게 문의해주세요.
                    </Typography>
                    <Button variant="outlined" onClick={() => fetchSites({ force: true })}>
                        다시 확인
                    </Button>
                </Stack>
            </Paper>
        </Box>
    );

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <AppBar position="static" sx={{ height: '5.5vh' }}>
                <Toolbar variant="dense" sx={{
                    position: 'relative',
                    justifyContent: 'center', // 가운데 정렬 기준
                    minHeight: '100% !important',
                }}>
                    {/* 좌측 햄버거(향후 Drawer 등) */}
                    <IconButton
                        size="small"
                        edge="start"
                        color="inherit"
                        aria-label="menu"
                        sx={{ mr: 1, height: '100%' }}
                        onMouseUp={(e) => (e.currentTarget as HTMLButtonElement).blur()}
                        onTouchEnd={(e) => (e.currentTarget as HTMLButtonElement).blur()}
                    >
                        <MenuIcon />
                    </IconButton>

                    <Typography variant="h4" component="div" sx={{ flexGrow: 1 }}>
                        PIAI 산업안전플랫폼
                    </Typography>

                    {/* 헤더 컨트롤을 한 버튼 메뉴로 묶음 (모바일) */}
                    <IconButton
                        size="large"
                        color="inherit"
                        aria-label="open controls"
                        aria-controls={ctrlOpen ? 'controls-menu' : undefined}
                        aria-expanded={ctrlOpen ? 'true' : undefined}
                        aria-haspopup="true"
                        onClick={handleCtrlOpen}
                        onMouseUp={(e) => (e.currentTarget as HTMLButtonElement).blur()}
                        onTouchEnd={(e) => (e.currentTarget as HTMLButtonElement).blur()}
                    >
                        <TuneRounded />
                    </IconButton>

                    <Menu
                        id="controls-menu"
                        anchorEl={ctrlAnchorEl}
                        open={ctrlOpen}
                        onClose={handleCtrlClose}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                        PaperProps={{ elevation: 3, sx: { mt: 1, p: 1.5, minWidth: 280 } }}
                    >
                        {/* 사이트 셀렉터 */}
                        {hasSites ? (
                            <Box sx={{ px: 0.5, pb: 1 }}>
                                <Typography variant="overline" sx={{ opacity: 0.7 }}>사이트 선택</Typography>
                                <SelectDashboard
                                    value={selectedLabel}
                                    onChange={(v) => { handleSelectChange(v); }}
                                    list={siteLabels}
                                    loading={dashLoading}
                                    errorMsg={dashError}
                                    onOpen={() => fetchSites({ force: true })}
                                />
                            </Box>
                        ) : (
                            <MenuItem disabled>
                                <Typography variant="body2" color="text.secondary">
                                    선택할 사이트가 없습니다
                                </Typography>
                            </MenuItem>
                        )}

                        <Divider sx={{ my: 1 }} />

                        {/* 기타 컨트롤(알림/메일 등)도 메뉴 안으로 */}
                        <MenuItem onClick={handleCtrlClose}>
                            <ListItemIcon><Badge badgeContent={2} color="error"><MailIcon /></Badge></ListItemIcon>
                            <Typography variant="body2">메일</Typography>
                        </MenuItem>
                        <MenuItem onClick={handleCtrlClose}>
                            <ListItemIcon><Badge badgeContent={17} color="error"><NotificationsIcon /></Badge></ListItemIcon>
                            <Typography variant="body2">알림</Typography>
                        </MenuItem>
                    </Menu>

                    {/* 계정 메뉴 버튼 */}
                    <IconButton
                        size="large"
                        edge="end"
                        aria-label="account of current user"
                        aria-controls={menuOpen ? 'account-menu' : undefined}
                        aria-haspopup="true"
                        aria-expanded={menuOpen ? 'true' : undefined}
                        color="inherit"
                        onClick={handleMenuOpen}
                        onMouseUp={(e) => (e.currentTarget as HTMLButtonElement).blur()}
                        onTouchEnd={(e) => (e.currentTarget as HTMLButtonElement).blur()}
                    >
                        <AccountCircle />
                    </IconButton>

                    {/* 계정 메뉴 본체 */}
                    <Menu
                        id="account-menu"
                        anchorEl={menuAnchorEl}
                        open={menuOpen}
                        onClose={handleMenuClose}
                        onClick={handleMenuClose}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                        PaperProps={{ elevation: 3, sx: { mt: 1.2, minWidth: 180 } }}
                    >
                        <MenuItem onClick={() => { }}>
                            <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
                            프로필
                        </MenuItem>
                        <MenuItem onClick={() => { }}>
                            <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                            설정
                        </MenuItem>
                        <Divider />
                        <MenuItem onClick={handleLogout}>
                            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                            로그아웃
                        </MenuItem>
                    </Menu>
                </Toolbar>
            </AppBar>

            {/* 본문: selectedKey 기준 분기 */}
            <Box sx={{ width: '100%', height: '92.5vh', p: 0 }}>
                {dashLoading && !selectedKey ? (
                    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                        <CircularProgress />
                    </Box>
                ) : selectedKey === DEFAULT_KEY ? (
                    DefaultLanding
                ) : (
                    <AlertCenterProvider>
                        {selectedKey === 'dgsp' && <DSGPDashboard />}
                        {selectedKey === 'kw' && <Box />} {/* TODO: kw 전용 대시보드로 교체 */}
                    </AlertCenterProvider>
                )}
            </Box>
        </Box>
    );
}
