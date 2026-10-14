"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

const themeKey = "otb-crm-theme";
const themeChangeEvent = "otb-crm-theme-change";
type Theme = "light" | "dark";

function getThemeSnapshot(): Theme {
  const savedTheme = localStorage.getItem(themeKey);
  if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeToTheme(onChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", onChange);
  window.addEventListener(themeChangeEvent, onChange);
  mediaQuery.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(themeChangeEvent, onChange);
    mediaQuery.removeEventListener("change", onChange);
  };
}

function applyTheme(theme: Theme) {
  localStorage.setItem(themeKey, theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  window.dispatchEvent(new Event(themeChangeEvent));
}

export function useCrmTheme() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => "light");
  const isDark = theme === "dark";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    applyTheme(isDark ? "light" : "dark");
  }, [isDark]);

  return { isDark, toggleTheme };
}
