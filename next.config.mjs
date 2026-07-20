/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The epilogue prose is verbatim source copy full of apostrophes/quotes; don't
  // let react/no-unescaped-entities (or any stray lint) block the Vercel build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
