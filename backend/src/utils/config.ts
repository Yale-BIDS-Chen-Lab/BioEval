// Fail-fast validation of security-critical configuration.
//
// The repo ships a known dev-default auth secret in .env.example for local
// convenience. Booting production with that value (or none) would let anyone
// forge sessions, so in production we refuse to start until it is replaced.

const DEV_DEFAULT_SECRET = "dev-default-secret-change-me-in-production";
const MIN_SECRET_LENGTH = 16;

/**
 * Throws with an actionable message if production config is unsafe.
 * No-op outside production (NODE_ENV !== "production"), so local/dev is unaffected.
 */
export function validateProductionConfig(
  env: NodeJS.ProcessEnv = process.env
): void {
  if (env.NODE_ENV !== "production") return;

  const problems: string[] = [];

  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.trim() === "") {
    problems.push("BETTER_AUTH_SECRET is required in production.");
  } else if (secret === DEV_DEFAULT_SECRET) {
    problems.push(
      "BETTER_AUTH_SECRET is still the committed dev default — generate a real one (e.g. `openssl rand -base64 32`)."
    );
  } else if (secret.length < MIN_SECRET_LENGTH) {
    problems.push(
      `BETTER_AUTH_SECRET is too short (< ${MIN_SECRET_LENGTH} chars); generate one with \`openssl rand -base64 32\`.`
    );
  }

  if (!env.DATABASE_URL) {
    problems.push("DATABASE_URL is required in production.");
  }
  if (!env.FRONTEND_URL) {
    problems.push(
      "FRONTEND_URL is required in production (used for CORS and auth trusted origins)."
    );
  }

  if (problems.length > 0) {
    throw new Error(
      "Refusing to start: unsafe production configuration:\n  - " +
        problems.join("\n  - ")
    );
  }
}

export { DEV_DEFAULT_SECRET };
