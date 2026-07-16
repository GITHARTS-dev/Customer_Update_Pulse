// Next's `output: "standalone"` intentionally omits static assets and the
// public folder from .next/standalone. Azure Static Web Apps' hybrid Next.js
// hosting needs them alongside the standalone server, so copy them in after
// every build - this mirrors the copy step in Microsoft's SWA + Next.js docs.
// fs.cpSync (not a shell `cp -r`) so the same command works on the Windows dev
// machine and the Linux CI runner that deploys it.
import { cpSync, existsSync } from "node:fs";

cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) {
  cpSync("public", ".next/standalone/public", { recursive: true });
}
