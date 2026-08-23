import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const githubBasePath = process.env.GITHUB_ACTIONS === "true" && repositoryName
  ? `/${repositoryName}`
  : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: githubBasePath,
  assetPrefix: githubBasePath,
  allowedDevOrigins: ['192.168.1.7'],
  images: { unoptimized: true },
};

module.exports = nextConfig;


export default nextConfig;
