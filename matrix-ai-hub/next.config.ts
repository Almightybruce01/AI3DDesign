import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Monorepo: load AI3DDesign/.env first so GROQ_API_KEY / OPENAI_API_KEY live at repo root. Hub .env.local still overrides. */
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Monorepo: parent AI3DDesign has another lockfile; keeps Vercel output tracing stable when nested. */
  outputFileTracingRoot: path.join(__dirname, '..'),
};

export default nextConfig;
