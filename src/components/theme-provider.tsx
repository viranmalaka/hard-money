"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  colorSwap: boolean;
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
        initializedRef.current = true;
      });
    } catch {
      // ignore
    }
  }, []);

  const applyTheme = (t: Theme, swap: boolean) => {
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
      applyTheme(activeTheme, activeSwap);
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
    applyTheme(nextTheme, colorSwap);
  };

  const setTheme = (newTheme: Theme) => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const effective = newTheme === "system" ? (media.matches ? "dark" : "light") : newTheme;
    setThemeState(newTheme);
    setResolvedTheme(effective);
    localStorage.setItem("hardmoney-theme", newTheme);
    applyTheme(newTheme, colorSwap);
  };

  const toggleColorSwap = () => {
    setColorSwapState((prev) => {
      const next = !prev;
      localStorage.setItem("hardmoney-color-swap", next ? "true" : "false");
      applyTheme(theme, next);
      return next;
    });
  };

  const setColorSwap = (swap: boolean) => {
    setColorSwapState(swap);
    localStorage.setItem("hardmoney-color-swap", swap ? "true" : "false");
    applyTheme(theme, swap);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        colorSwap,
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
