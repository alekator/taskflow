const fallbackApiUrl = "http://localhost:3001/api";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || fallbackApiUrl;

export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");
