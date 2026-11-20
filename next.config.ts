import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd()),
  reactStrictMode: true,
  transpilePackages: ["@reown/appkit", "@reown/appkit-adapter-wagmi"],
  webpack: (config, { webpack }) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
    };
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@x402(\/|$)/ }));
    return config;
  },
};

export default nextConfig;
