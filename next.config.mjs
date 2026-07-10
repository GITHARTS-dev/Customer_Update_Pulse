import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Deployed to Azure Static Web Apps' hybrid Next.js support, which builds the
  // standard `.next` output — do NOT set `output: "standalone"` (SWA doesn't run
  // that self-contained server; every route 404s if you do).
  //
  // Pin the file-tracing root to this folder so Next's tracer doesn't walk up
  // to the drive root (on Windows it would scan D:\pagefile.sys etc. and throw
  // EINVAL); harmless and correct on the Linux CI runner too.
  outputFileTracingRoot: __dirname
};

export default nextConfig;
