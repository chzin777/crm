"use client";

import React from "react";

interface ThemeSwitchProps {
  isDark: boolean;
  onToggle: () => void;
}

export function ThemeSwitch({ isDark, onToggle }: ThemeSwitchProps) {
  return (
    <label
      className="uiverse-switch cursor-pointer hover:cursor-pointer"
      title={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
    >
      <input
        type="checkbox"
        checked={isDark}
        onChange={onToggle}
        aria-label="Alternar tema claro e escuro"
        className="cursor-pointer hover:cursor-pointer"
      />
      <span className="uiverse-slider cursor-pointer hover:cursor-pointer" />
    </label>
  );
}
