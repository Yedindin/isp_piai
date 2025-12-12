import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { fileURLToPath, URL } from 'node:url'


// https://vite.dev/config/
export default defineConfig({
  plugins: [svgr({
      // 기본 .svg 임포트도 컴포넌트 변환 대상에 포함
      include: '**/*.svg',
      svgrOptions: {
        exportType: 'named',
        namedExport: 'ReactComponent',
      },
    }), react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['piai_kafka3.aiot.town'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)), 
    },
  },
  build: {
    sourcemap: false,   // ✅ 소스맵 끄기
    minify: 'terser',   // 최소화
  },
  esbuild: {
    drop: ['console', 'debugger'], // 선택: 콘솔/디버거 제거
  },
})
