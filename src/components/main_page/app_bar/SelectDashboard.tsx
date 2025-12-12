import React from 'react';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';

type Props = {
    value: string;
    onChange: (next: string) => void;
    list: string[];
    loading?: boolean;
    errorMsg?: string;
    onOpen?: () => void;         // ✅ 드롭다운 열 때 호출
};

const SelectDashboard: React.FC<Props> = ({
    value, onChange, list, loading = false, errorMsg = '', onOpen,
}) => {
    const handleChange = (event: SelectChangeEvent<string>) => {
        onChange(event.target.value as string);
    };

    return (
        <Select
            labelId="dashboard-select"
            id="dashboard-simple-select"
            value={value}
            onChange={handleChange}
            onOpen={onOpen}                // ✅ 클릭(열기) 시 부모의 fetch 호출
            displayEmpty
            fullWidth
            sx={{
                minWidth: 220,
                // height: 36,
                color: 'white',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                '& .MuiSelect-icon': { color: 'black' },
            }}
            renderValue={(selected) =>
                selected ? (
                    <Typography color="black">{selected}</Typography>
                ) : loading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={16} />
                        <Typography color="black">불러오는 중…</Typography>
                    </Box>
                ) : errorMsg ? (
                    <Typography color="error.main">{errorMsg}</Typography>
                ) : (
                    <Typography color="black">대시보드를 선택하세요</Typography>
                )
            }
            MenuProps={{ PaperProps: { sx: { maxHeight: '60vh' } } }}
        >
            <ListSubheader sx={{ pt: 0 }}>대학중점연구소</ListSubheader>

            {loading && (
                <MenuItem disabled>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={18} />
                        <Typography variant="body2">불러오는 중…</Typography>
                    </Box>
                </MenuItem>
            )}

            {!loading && errorMsg && (
                <MenuItem disabled>
                    <Typography variant="body2" color="error">
                        {errorMsg}
                    </Typography>
                </MenuItem>
            )}

            {!loading && !errorMsg && list.length === 0 && (
                <MenuItem disabled>
                    <Typography variant="body2" color="text.secondary">
                        표시할 대시보드가 없습니다.
                    </Typography>
                </MenuItem>
            )}

            {!loading && !errorMsg && list.map((name) => (
                <MenuItem key={name} value={name}>
                    <ListItemText
                        primary={name}
                        sx={{
                            '& .MuiTypography-root': { fontSize: '1.0rem' },
                            '& .MuiTypography-body2': { fontSize: '0.875rem' },
                        }}
                    />
                </MenuItem>
            ))}
        </Select>
    );
};

export default SelectDashboard;