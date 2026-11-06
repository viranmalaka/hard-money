import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "@/lib/api/client";

describe("Auth & 401 Navigation Handling", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

    vi.stubGlobal("window", {
      location: {
        pathname: "/more",
        href: "http://localhost:3000/more",
      },
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects to /login?callbackUrl=... and clears active user on 401 response", async () => {
    const errorResponse = {
      response: {
        status: 401,
        data: { error: "Session expired" },
      },
      config: { url: "/user/settings" },
      isAxiosError: true,
    };

    const responseHandler = (apiClient.interceptors.response as any).handlers[0];
    expect(responseHandler).toBeDefined();

    await expect(responseHandler.rejected(errorResponse)).rejects.toMatchObject({
      status: 401,
      message: "Session expired",
    });

    expect(localStorage.removeItem).toHaveBeenCalledWith("hardmoney_active_user");
    expect(window.location.href).toBe("/login?callbackUrl=%2Fmore");
  });

  it("does not redirect when 401 error is from /api/auth/login", async () => {
    window.location.pathname = "/login";
    window.location.href = "http://localhost:3000/login";

    const errorResponse = {
      response: {
        status: 401,
        data: { error: "Invalid credentials" },
      },
      config: { url: "/auth/login" },
      isAxiosError: true,
    };

    const responseHandler = (apiClient.interceptors.response as any).handlers[0];

    await expect(responseHandler.rejected(errorResponse)).rejects.toMatchObject({
      status: 401,
      message: "Invalid credentials",
    });

    // Should NOT change location.href to a new path
    expect(window.location.href).toBe("http://localhost:3000/login");
  });
});
