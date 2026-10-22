import axios, { AxiosError, AxiosInstance } from "axios";

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  details?: unknown;
}

function readErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const value = data as { error?: unknown; message?: unknown };
  if (typeof value.error === "string") return value.error;
  if (typeof value.message === "string") return value.message;
  return undefined;
}

export function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;
    return {
      message: readErrorMessage(responseData) || error.message || "Request failed",
      status: error.response?.status,
      code: error.code,
      details: responseData,
    };
  }
  if (error instanceof Error) return { message: error.message };
  return { message: "Request failed", details: error };
}

export function isRetryableApiError(error: unknown): boolean {
  const normalized = toApiError(error);
  return normalized.status === undefined || normalized.status >= 500;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(toApiError(error))
);
