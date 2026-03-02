import { createAuthClient } from "better-auth/react";

function getApiBaseUrl(): string {
  if (typeof window !== "undefined" && !window.location.origin.includes("localhost")) {
    return window.location.origin;
  }
  return import.meta.env.VITE_BACKEND_URL ?? "";
}

// When not on localhost (e.g. tunnel), omit baseURL so the client uses current origin for every
// request (sign-in, sign-out, session). Avoids stale origin and sign-out working correctly.
export const authClient = createAuthClient(
  typeof window !== "undefined" && !window.location.origin.includes("localhost")
    ? {} // same origin
    : { baseURL: import.meta.env.VITE_BACKEND_URL ?? "" }
);
