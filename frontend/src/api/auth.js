import { apiRequest, setAccessToken } from "./client.js";

export async function login(credentials) {
  const data = await apiRequest("/auth/login", {
    method: "POST",
    body: credentials
  });
  setAccessToken(data.access_token);
  return data;
}

export async function registerPatient(payload) {
  const data = await apiRequest("/auth/register", {
    method: "POST",
    body: payload
  });
  setAccessToken(data.access_token);
  return data;
}

export function me() {
  return apiRequest("/auth/me");
}

export function logout() {
  setAccessToken("");
}
