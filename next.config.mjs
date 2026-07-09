/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keeps the deployed app under Azure Static Web Apps' 250 MB app-size cap
  // by tracing only the files actually needed at runtime (no full node_modules).
  output: "standalone"
};

export default nextConfig;
