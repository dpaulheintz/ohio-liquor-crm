import type { NextConfig } from "next";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('./package.json');

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    NEXT_PUBLIC_APP_VERSION: `v${pkg.version.split('.')[1]}`,
  },
};

export default nextConfig;
