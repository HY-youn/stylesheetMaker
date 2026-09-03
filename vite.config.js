import { defineConfig } from "vite";

// 단일 index.html 정적 앱. 빌드 산출물은 dist/ 로 나가고 Vercel이 그대로 서빙한다.
export default defineConfig({
  server: {
    port: 8765,
    host: true, // LAN에서 접속 허용 (모바일 반응형 확인용)
    strictPort: false,
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: "dist",
    target: "es2019",
    cssMinify: true,
  },
});
