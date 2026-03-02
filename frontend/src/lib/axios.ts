import axiosLib from "axios";

function getApiBaseUrl(): string {
  if (typeof window !== "undefined" && !window.location.origin.includes("localhost")) {
    return window.location.origin;
  }
  return import.meta.env.VITE_BACKEND_URL ?? "";
}

const axios = axiosLib.create({
  baseURL: getApiBaseUrl(),
});

export { axios };
