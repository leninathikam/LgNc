import { create } from "zustand";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  const stored = localStorage.getItem("lgnc-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("lgnc-theme", theme);
}

interface ThemeStore {
  theme: Theme;
  toggle: () => void;
}

export const useTheme = create<ThemeStore>((set, get) => {
  const theme = initialTheme();
  apply(theme);
  return {
    theme,
    toggle: () => {
      const next: Theme = get().theme === "dark" ? "light" : "dark";
      apply(next);
      set({ theme: next });
    },
  };
});
