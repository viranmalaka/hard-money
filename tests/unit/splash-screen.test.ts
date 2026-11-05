import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ServerSplashScreen } from "@/components/server-splash-screen";
import { SplashScreenClient } from "@/components/splash-screen-client";

describe("ServerSplashScreen & SplashScreenClient", () => {
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

  it("server-renders ServerSplashScreen into initial HTML with 3D banknote elements", () => {
    const html = renderToString(React.createElement(ServerSplashScreen));

    // Must be in root layer with fixed positioning and high z-index
    expect(html).toContain('id="hm-splash-screen"');
    expect(html).toContain("Hard Money");
    expect(html).toContain("Personal Treasury &amp; Ledger");
    expect(html).toContain("Counting cash flows &amp; reserves...");

    // Must contain 3D banknotes (Inflow $100, $500, $1,000 and Outflow $120, $250)
    expect(html).toContain("+$100");
    expect(html).toContain("+$500");
    expect(html).toContain("+$1,000");
    expect(html).toContain("-$120");
    expect(html).toContain("-$250");

    // Must contain holographic foil and 3D scenes
    expect(html).toContain("hm-scene-3d");
    expect(html).toContain("hm-note-foil");
    expect(html).toContain("hm-stream-svg");

    // Must contain skip button
    expect(html).toContain('id="hm-splash-skip-btn"');
  });

  it("exports SplashScreenClient as a valid React component", () => {
    expect(typeof SplashScreenClient).toBe("function");
    const element = React.createElement(SplashScreenClient);
    expect(React.isValidElement(element)).toBe(true);
  });
});
