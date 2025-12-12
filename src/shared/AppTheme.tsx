import React from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { createTheme } from '@mui/material/styles';
// DataGrid 테마 오버라이드 타입 확장 (없으면 TS 에러)
import '@mui/x-data-grid/themeAugmentation';

const base = createTheme();

const defaultTheme = createTheme({
  palette: {
    primary: { main: '#22177A' },
    secondary: { main: '#605EA1' },
    background: {
      default: '#222831',
      paper: '#EEEEEE',
    },
    text: {
      primary: '#000000',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#EEEEEE',
          color: '#000000',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          backgroundColor: '#EEEEEE',
          color: '#000000',
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: {
          backgroundColor: '#393E46',
          padding: '8px 0px 8px 14px',
          color: '#ffffff',
        },
      },
    },
    MuiList: {
      styleOverrides: {
        root: {
          backgroundColor: '#EEEEEE',
        },
      },
    },
    MuiModal: {
      styleOverrides: {
        root: {},
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          backgroundColor: '#EEEEEE',
          color: '#ffffff',
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: '#ffffff',
            color: '#ffffff',
            fontSize: '0.9rem',
            fontWeight: 600,
          },
          // 커스텀 CSS 변수 사용
          '--DataGrid-containerBackground': '#0F4C75',
        },
        panelContent: {
          backgroundColor: '#EEEEEE',
        },
        row: {
          height: '50px',
        },
        cell: {
          backgroundColor: '#ffffff',
          color: '#000000',
        },
      },
    },
  },
  typography: {
    fontFamily: 'Pretendard-Regular, Roboto',
    h1: {
      fontSize: base.typography.pxToRem(48),
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: -0.5,
    },
    h2: {
      fontSize: base.typography.pxToRem(36),
      fontWeight: 600,
      lineHeight: 1.2,
    },
    h3: {
      fontSize: base.typography.pxToRem(30),
      lineHeight: 1.2,
    },
    h4: {
      fontSize: base.typography.pxToRem(24),
      fontWeight: 600,
      lineHeight: 1.5,
    },
    h5: {
      fontSize: base.typography.pxToRem(20),
      fontWeight: 600,
    },
    h6: {
      fontSize: base.typography.pxToRem(18),
      fontWeight: 600,
    },
    subtitle1: {
      fontSize: base.typography.pxToRem(18),
    },
    subtitle2: {
      fontSize: base.typography.pxToRem(16),
      fontWeight: 600,
    },
    body1: {
      fontSize: base.typography.pxToRem(14),
    },
    body2: {
      fontSize: base.typography.pxToRem(14),
      fontWeight: 400,
    },
    caption: {
      fontSize: base.typography.pxToRem(12),
      fontWeight: 400,
    },
  },
});

type AppThemeProps = React.PropsWithChildren<{}>;

const AppTheme: React.FC<AppThemeProps> = ({ children }) => {
  return (
    <ThemeProvider theme={defaultTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

export default AppTheme;