import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Local monorepo: load AI3DDesign/.env. On Vercel, env comes from Project → Environment Variables only. */
if (process.env.VERCEL !== '1') {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Monorepo local dev: trace includes parent lockfile. On Vercel the app root IS `matrix-ai-hub`;
   * pointing outside the deployment breaks file tracing (ENOENT routes-manifest).
   */
  ...(process.env.VERCEL !== '1'
    ? { outputFileTracingRoot: path.join(__dirname, '..') }
    : {}),
};

export default nextConfig;
