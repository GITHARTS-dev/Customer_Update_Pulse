import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // REQUIRED for Azure Static Web Apps hybrid Next.js: the deployed app must be
  // under SWA's 250 MB cap, but this app's node_modules is ~397 MB. Microsoft's
  // docs say to use Next's standalone output for exactly this. Without it, SWA
  // can't provision the SSR backend and every dynamic route 404s.
  // `scripts/copy-standalone-assets.mjs` (run from the build script) copies
  // .next/static and public/ into the standalone folder, as the docs require.
  output: "standalone",
  // Pin the file-tracing root to this folder so Next's tracer doesn't walk up
  // to the drive root (on Windows it would scan D:\pagefile.sys etc. and throw
  // EINVAL); harmless and correct on the Linux CI runner too.
  outputFileTracingRoot: __dirname
};

export default nextConfig;
