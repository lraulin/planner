import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Achieve Full XML dumps are often multi-MB (schema + years of data). Import passes the
  // file body through a Server Action; the default 1 MB cap rejects those before our own
  // 25 MB guard in importAchieveXmlAction can run.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
