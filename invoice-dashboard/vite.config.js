import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served under /invoice/ inside the HARTS launchpad (a single Azure Static Web
// App also hosts the Next.js Pulse app at the root). `base` makes Vite emit all
// asset URLs as /invoice/... and sets import.meta.env.BASE_URL to "/invoice/",
// which the app uses for its MSAL redirect and its favicon path.
export default defineConfig({
  base: "/invoice/",
  plugins: [react()],
});
