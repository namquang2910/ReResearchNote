/** @type {import('next').NextConfig} */
const API_ORIGIN = (process.env.API_ORIGIN || 'http://localhost:4000').replace(/\/$/, '');

export default {
  reactStrictMode: true,
  poweredByHeader: false,
  // gói gọn để Docker image nhỏ (chạy bằng `node server.js`)
  output: 'standalone',
  // cho phép chạy thêm một bản dev song song (vd. test) mà không dùng chung .next
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Trình duyệt luôn gọi cùng origin `/api`; Next (dev) hoặc Caddy (production) chuyển tiếp tới NestJS.
  // => cookie phiên là first-party, không cần CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};
