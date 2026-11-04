"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

export type ThemePackId =
  | "default"
  | "nordic-sage"
  | "private-wealth"
  | "ocean-cobalt"
  | "warm-espresso"
  | "linear-violet"
  | "swiss-ink"
  | "airy-comfort";

export interface ThemePackOption {
  id: ThemePackId;
  name: string;
  badge: string;
  summary: string;
  swatches: [string, string, string, string]; // [surface/bg, accent, income, expense]
}

export const ACTIVE_THEME_PACK: ThemePackId = "private-wealth";

export const THEME_PACKS: ThemePackOption[] = [
  {
    id: "default",
    name: "Hard Money Classic",
    badge: "Default · 1.0x",
    summary: "System UI · Balanced density · Crimson & Royal Blue",
    swatches: ["#F5F6F7", "#C72C38", "#1D5BD2", "#C92A2A"],
  },
  {
    id: "nordic-sage",
    name: "Nordic Linen & Sage",
    badge: "Calm · 1.06x · Airy",
    summary: "Plus Jakarta Sans · Warm linen canvas · Sage & Terracotta",
    swatches: ["#EFECE6", "#1F6F54", "#0F766E", "#C84B31"],
  },
  {
    id: "private-wealth",
    name: "Emerald Private Bank",
    badge: "Executive · 1.04x",
    summary: "Inter + Plex Mono · Pearl & Navy · Sovereign Emerald",
    swatches: ["#EEF2F6", "#059669", "#047857", "#E11D48"],
  },
  {
    id: "ocean-cobalt",
    name: "Revolut Cobalt",
    badge: "Neo-Bank · 1.05x",
    summary: "DM Sans · Crisp ice surfaces · Electric Cobalt & Mint",
    swatches: ["#EEF3FB", "#2563EB", "#0D9488", "#E11D48"],
  },
  {
    id: "warm-espresso",
    name: "Espresso & Sand",
    badge: "Editorial · 1.08x · Relaxed",
    summary: "Outfit · Oatmeal & roasted umber · Burnished Amber",
    swatches: ["#F1EAE0", "#B45309", "#15803D", "#B91C1C"],
  },
  {
    id: "linear-violet",
    name: "Linear Indigo",
    badge: "Precision · 0.98x",
    summary: "Inter · Cool graphite & mist · Crisp Violet & Tailored corners",
    swatches: ["#F2F3F8", "#5E6AD2", "#16A34A", "#E11D48"],
  },
  {
    id: "swiss-ink",
    name: "Swiss Monochrome",
    badge: "Architectural · 1.05x",
    summary: "Space Grotesk · Stark paper & ink · Sharp geometry",
    swatches: ["#F4F4F5", "#18181B", "#0F766E", "#DC2626"],
  },
  {
    id: "airy-comfort",
    name: "Airy Comfort XL",
    badge: "Easy-Read · 1.14x · Spacious",
    summary: "Plus Jakarta Sans · Extra-large text & +18% mobile spacing",
    swatches: ["#EEF4FA", "#0284C7", "#15803D", "#DC2626"],
  },
];

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap";

function ensureThemeFontsLoaded(pack: ThemePackId) {
  if (typeof document === "undefined" || pack === "default") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (document.getElementById("hm-theme-pack-fonts")) return;

  const link = document.createElement("link");
  link.id = "hm-theme-pack-fonts";
  link.rel = "stylesheet";
  link.href = GOOGLE_FONTS_HREF;
  document.head.appendChild(link);
}

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  colorSwap: boolean;
  themePack: ThemePackId;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  toggleColorSwap: () => void;
  setColorSwap: (swap: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [colorSwap, setColorSwapState] = useState<boolean>(false);
  const themePack: ThemePackId = ACTIVE_THEME_PACK;
  const initializedRef = React.useRef(false);

  useEffect(() => {
    try {
      const savedTheme = (localStorage.getItem("hardmoney-theme") as Theme) || "system";
      const savedColorSwap = localStorage.getItem("hardmoney-color-swap") === "true";

      queueMicrotask(() => {
        if (savedTheme !== "system") {
          setThemeState(savedTheme);
        }
        if (savedColorSwap) {
          setColorSwapState(true);
        }
        ensureThemeFontsLoaded(ACTIVE_THEME_PACK);
        initializedRef.current = true;
      });
    } catch {
      // ignore
    }
  }, []);

  const applyTheme = (t: Theme, swap: boolean, pack: ThemePackId) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const isDark = t === "dark" || (t === "system" && media.matches);

    if (t === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", t);
    }

    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    root.setAttribute("data-color-swap", swap ? "true" : "false");
    root.setAttribute("data-theme-pack", pack);
    ensureThemeFontsLoaded(pack);
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      let activeTheme = theme;
      let activeSwap = colorSwap;

      if (!initializedRef.current && typeof window !== "undefined") {
        const saved = localStorage.getItem("hardmoney-theme") as Theme | null;
        if (saved) activeTheme = saved;
        const savedSwap = localStorage.getItem("hardmoney-color-swap");
        if (savedSwap !== null) activeSwap = savedSwap === "true";
      }

      const effectiveTheme =
        activeTheme === "system" ? (media.matches ? "dark" : "light") : activeTheme;

      setResolvedTheme(effectiveTheme);
      applyTheme(activeTheme, activeSwap, ACTIVE_THEME_PACK);
    };

    updateTheme();
    media.addEventListener("change", updateTheme);
    return () => media.removeEventListener("change", updateTheme);
  }, [theme, colorSwap]);

  const toggleTheme = () => {
    const nextTheme: Theme = resolvedTheme === "dark" ? "light" : "dark";
    setThemeState(nextTheme);
    setResolvedTheme(nextTheme);
    localStorage.setItem("hardmoney-theme", nextTheme);
    applyTheme(nextTheme, colorSwap, ACTIVE_THEME_PACK);
  };

  const setTheme = (newTheme: Theme) => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const effective = newTheme === "system" ? (media.matches ? "dark" : "light") : newTheme;
    setThemeState(newTheme);
    setResolvedTheme(effective);
    localStorage.setItem("hardmoney-theme", newTheme);
    applyTheme(newTheme, colorSwap, ACTIVE_THEME_PACK);
  };

  const toggleColorSwap = () => {
    setColorSwapState((prev) => {
      const next = !prev;
      localStorage.setItem("hardmoney-color-swap", next ? "true" : "false");
      applyTheme(theme, next, ACTIVE_THEME_PACK);
      return next;
    });
  };

  const setColorSwap = (swap: boolean) => {
    setColorSwapState(swap);
    localStorage.setItem("hardmoney-color-swap", swap ? "true" : "false");
    applyTheme(theme, swap, ACTIVE_THEME_PACK);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        colorSwap,
        themePack,
        toggleTheme,
        setTheme,
        toggleColorSwap,
        setColorSwap,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
