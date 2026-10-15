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

  useEffect(() => {
    const savedTheme = (localStorage.getItem("hardmoney-theme") as Theme) || "system";
    const savedColorSwap = localStorage.getItem("hardmoney-color-swap") === "true";
    queueMicrotask(() => {
      if (savedTheme !== "system") setThemeState(savedTheme);
      if (savedColorSwap) setColorSwapState(true);
    });
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      const effectiveTheme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;

      setResolvedTheme(effectiveTheme);

      const root = document.documentElement;
      if (theme === "system") {
        root.removeAttribute("data-theme");
        root.classList.remove("dark");
        if (media.matches) {
          root.classList.add("dark");
        }
      } else {
        root.setAttribute("data-theme", theme);
        if (theme === "dark") {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }
      }

      root.setAttribute("data-color-swap", colorSwap ? "true" : "false");
    };

    updateTheme();
    media.addEventListener("change", updateTheme);
    return () => media.removeEventListener("change", updateTheme);
  }, [theme, colorSwap]);

  const toggleTheme = () => {
    const nextTheme: Theme = resolvedTheme === "dark" ? "light" : "dark";
    setThemeState(nextTheme);
    localStorage.setItem("hardmoney-theme", nextTheme);
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("hardmoney-theme", newTheme);
  };

  const toggleColorSwap = () => {
    setColorSwapState((prev) => {
      const next = !prev;
      localStorage.setItem("hardmoney-color-swap", next ? "true" : "false");
      return next;
    });
  };

  const setColorSwap = (swap: boolean) => {
    setColorSwapState(swap);
    localStorage.setItem("hardmoney-color-swap", swap ? "true" : "false");
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
