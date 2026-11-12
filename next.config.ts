import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "@sparticuz/chromium",
    "fluent-ffmpeg",
    "ffmpeg-static",
  ],
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.epidemicsound.com",
      },
      {
        protocol: "https",
        hostname: "epidemicsound.com",
      },
      {
        protocol: "https",
        hostname: "**.cloudfront.net",
      },
      {
        protocol: "https",
        hostname: "cdn.epidemicsound.com",
      },
      {
        protocol: "https",
        hostname: "**.envatousercontent.com",
      },
      {
        protocol: "https",
        hostname: "**.envato.com",
      },
    ],
  },
};

export default nextConfig;
