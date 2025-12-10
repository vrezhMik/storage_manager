/** @type {import('next').NextConfig} */
// When deploying to GitHub Pages the site will be served from a sub-path
// (e.g. https://user.github.io/storage_manager/). Allow overriding the base
// path via env so local dev stays at the root.
const repoBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim();
const basePath = repoBasePath
  ? `/${repoBasePath.replace(/^\/+|\/+$/g, "")}`
  : "";

const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  basePath: basePath || undefined,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
