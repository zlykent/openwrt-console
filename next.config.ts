import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // The console talks to a device on the LAN over SSH from the server side.
  // ssh2 pulls in native/Node-only modules, so keep it external to bundling.
  // Next 16 no longer runs ESLint during `next build`; lint is a separate script.
  serverExternalPackages: ["ssh2"],
  allowedDevOrigins: ['localhost', '127.0.0.1'],
};

export default withNextIntl(nextConfig);
