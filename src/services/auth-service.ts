import { apiClient } from "@/lib/api/client";

export interface SessionUser {
  id: string;
  name?: string;
  email?: string;
}

export interface SessionResponse {
  user: SessionUser | null;
}

export async function getSession() {
  const { data } = await apiClient.get<SessionResponse>("/auth/session");
  return data;
}

export async function login(input: { email: string; password: string }) {
  const { data } = await apiClient.post("/auth/login", input);
  return data;
}

export async function register(input: { name: string; email: string; password: string }) {
  const { data } = await apiClient.post("/auth/register", input);
  return data;
}

export async function logout() {
  const { data } = await apiClient.post("/auth/logout");
  return data;
}
