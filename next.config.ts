import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // These packages are used only in server-side route handlers and must not be
  // bundled by webpack. They will be required at runtime from node_modules.
  serverExternalPackages: ["nodemailer", "exceljs", "pdf-lib"],
};

export default nextConfig;
