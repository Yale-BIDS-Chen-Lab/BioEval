import { betterAuth } from "better-auth";
import { Pool } from "pg";

export const auth = betterAuth({
  database: new Pool({
    // connection options
    connectionString: process.env.DATABASE_URL!,
  }),
  trustedOrigins: [
    process.env.FRONTEND_URL!,
    ...(process.env.ADDITIONAL_ORIGINS?.split(",").map((o) => o.trim()) ?? []),
    "https://*.trycloudflare.com", // any Cloudflare Tunnel URL; no need to add each URL to ADDITIONAL_ORIGINS
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter(Boolean),
  secret: process.env.BETTER_AUTH_SECRET!,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 64,
  },
});
