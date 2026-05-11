const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

let accessToken = localStorage.getItem("dental_access_token") || "";

export function setAccessToken(token) {
  accessToken = token || "";
  if (accessToken) {
    localStorage.setItem("dental_access_token", accessToken);
  } else {
    localStorage.removeItem("dental_access_token");
  }
}

export function getAccessToken() {
  return accessToken;
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData) && options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body:
      options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && data.error
        ? data.error
        : "Не удалось выполнить запрос";
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}
