/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: process.env.NODE_ENV === "prod" ? false : true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "dev" ? false : true,
  },
  experimental: {
    nextScriptWorkers: false, // Prevents unnecessary Next.js scripts
  },
  env: {
    DISABLE_NEXTJS_DEVTOOLS: "true", // Ensure DevTools is disabled
  },
};

module.exports = nextConfig;
