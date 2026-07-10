import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keeps the deployed app under Azure Static Web Apps' 250 MB app-size cap
  // by tracing only the files actually needed at runtime (no full node_modules).
  output: "standalone",
  // Without this, Next infers the file-tracing root by walking up for a
  // lockfile and can land on the drive root (D:\) on this machine, so its
  // watcher/tracer then scans D:\pagefile.sys, D:\System Volume Information,
  // etc. and throws EINVAL. Pinning it to the project folder stops that scan.
  outputFileTracingRoot: __dirname
};

export default nextConfig;
