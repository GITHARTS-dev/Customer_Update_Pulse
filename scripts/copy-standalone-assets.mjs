// Next.js `output: "standalone"` intentionally omits static assets and the
// public folder from .next/standalone (they're meant to be served by a CDN in
// front of the app). Azure's hybrid Next.js hosting expects them alongside the
// standalone server, so this copies them in after every build. Uses fs.cpSync
// instead of a shell `cp -r` so the same build command works on the Windows
// dev machine and the Linux CI runner that actually deploys it.
import { cpSync, existsSync } from "node:fs";

cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) {
  cpSync("public", ".next/standalone/public", { recursive: true });
}
