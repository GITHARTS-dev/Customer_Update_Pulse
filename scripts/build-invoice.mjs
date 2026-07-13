// Builds the standalone Invoice Dashboard (a separate Vite SPA in
// invoice-dashboard/) and drops its output into public/invoice/, so the single
// Azure Static Web App serves it as static files at /invoice/ alongside the
// Next.js Pulse app.
//
// The two apps stay completely separate builds — this only copies the finished
// artifact. Run `npm run build:invoice` after changing anything under
// invoice-dashboard/, then commit the refreshed public/invoice/. It is
// deliberately NOT part of `npm run build`, so the CI/SWA deploy just serves the
// committed static files and never has to install the invoice's deps or run
// Vite (keeping the Next.js deploy path unchanged and low-risk).
import { execSync } from "node:child_process";
import { cpSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const inv = path.join(root, "invoice-dashboard");
const dist = path.join(inv, "dist");
const dest = path.join(root, "public", "invoice");

if (!existsSync(path.join(inv, "node_modules"))) {
  console.log("[build-invoice] installing invoice-dashboard deps…");
  execSync("npm install", { cwd: inv, stdio: "inherit" });
}

console.log("[build-invoice] building invoice-dashboard (base=/invoice/)…");
execSync("npm run build", { cwd: inv, stdio: "inherit" });

console.log(`[build-invoice] copying dist → ${path.relative(root, dest)}`);
if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
cpSync(dist, dest, { recursive: true });

// Defensive: a SWA config inside the deployed tree could hijack routing (this
// is exactly what broke the Pulse deploy once). The invoice build shouldn't
// emit one, but make sure none rides along.
const stray = path.join(dest, "staticwebapp.config.json");
if (existsSync(stray)) rmSync(stray);

console.log("[build-invoice] done.");
