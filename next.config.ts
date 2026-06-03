import type { NextConfig } from "next";

const devOrigins = ['localhost:3000'];
if (process.env.NEXTAUTH_URL) {
  try {
    const url = new URL(process.env.NEXTAUTH_URL);
    devOrigins.push(url.host);
  } catch (e) {
    // Ignorar si no es una URL válida
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
};

export default nextConfig;
