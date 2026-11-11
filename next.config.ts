import type { NextConfig } from "next";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('./package.json');

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    NEXT_PUBLIC_APP_VERSION: `v${pkg.version.split('.')[1]}`,
  },
  // Barrel Arcade kids game: serve public/play/index.html at /play
  // Rusty Bucket Arcade sales demo: serve public/demo/rusty-bucket-arcade/index.html
  rewrites: async () => [
    { source: '/play', destination: '/play/index.html' },
    { source: '/demo/rusty-bucket-arcade', destination: '/demo/rusty-bucket-arcade/index.html' },
  ],
  headers: async () => [
    {
      // All pages/routes — prevent stale cached HTML on mobile browsers
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Pragma', value: 'no-cache' },
        { key: 'Expires', value: '0' },
      ],
    },
  ],
};

export default nextConfig;
