import { test } from "node:test";
import { strict as assert } from "node:assert";
import { validateProductionConfig, DEV_DEFAULT_SECRET } from "./config";

const STRONG = "a-sufficiently-long-secret-value";
const prodBase = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://user:pw@db/app",
  FRONTEND_URL: "http://localhost:3000",
};

test("is a no-op outside production", () => {
  assert.doesNotThrow(() =>
    validateProductionConfig({ NODE_ENV: "development" } as any)
  );
  assert.doesNotThrow(() => validateProductionConfig({} as any));
});

test("rejects the committed dev-default secret in production", () => {
  assert.throws(
    () =>
      validateProductionConfig({
        ...prodBase,
        BETTER_AUTH_SECRET: DEV_DEFAULT_SECRET,
      } as any),
    /dev default/
  );
});

test("rejects a missing secret in production", () => {
  assert.throws(
    () => validateProductionConfig({ ...prodBase } as any),
    /BETTER_AUTH_SECRET is required/
  );
});

test("rejects a too-short secret in production", () => {
  assert.throws(
    () =>
      validateProductionConfig({ ...prodBase, BETTER_AUTH_SECRET: "short" } as any),
    /too short/
  );
});

test("rejects missing DATABASE_URL in production", () => {
  assert.throws(
    () =>
      validateProductionConfig({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: STRONG,
        FRONTEND_URL: "http://localhost:3000",
      } as any),
    /DATABASE_URL is required/
  );
});

test("passes in production with a strong secret and required vars", () => {
  assert.doesNotThrow(() =>
    validateProductionConfig({ ...prodBase, BETTER_AUTH_SECRET: STRONG } as any)
  );
});
