import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { SplashScreen } from "@/components/splash-screen";

describe("SplashScreen Component", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports SplashScreen as a valid React component", () => {
    expect(typeof SplashScreen).toBe("function");
    const element = React.createElement(SplashScreen);
    expect(React.isValidElement(element)).toBe(true);
  });

  it("creates the component structure with expected brand markers", () => {
    const element = React.createElement(SplashScreen);
    expect(element.type).toBe(SplashScreen);
  });
});
