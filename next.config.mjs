import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A package-lock.json in the home folder confuses Next's workspace-root detection.
  outputFileTracingRoot: root,
  turbopack: { root },
};
export default nextConfig;
