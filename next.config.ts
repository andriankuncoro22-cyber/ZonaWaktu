import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // <-- Tambahkan ini agar Next.js menghasilkan file statis (HTML/CSS/JS)
  images: {
    unoptimized: true, // <-- Wajib ditambahkan agar tidak error saat ekspor statis
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  experimental: {
    workerThreads: false,
  },
};

export default nextConfig;