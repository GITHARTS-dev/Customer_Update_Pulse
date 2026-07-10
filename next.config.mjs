import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: do NOT set `output: "standalone"` here. Azure Static Web Apps' hybrid
  // Next.js support builds the standard `.next` output and wires the server to
  // its own managed backend, tracing only the runtime deps itself. Setting
  // "standalone" makes Next emit a self-contained server SWA doesn't run, so no
  // SSR handler serves requests and every dynamic route (including "/") 404s.
  //
  // Pin the file-tracing root to this folder so Next's tracer doesn't walk up
  // to the drive root (on Windows it would scan D:\pagefile.sys etc. and throw
  // EINVAL); harmless and correct on the Linux CI runner too.
  outputFileTracingRoot: __dirname
};

export default nextConfig;
