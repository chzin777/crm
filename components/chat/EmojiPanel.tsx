"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import emojisPt from "emoji-picker-react/data/emojis-pt";

const LIGHT_COLORS = {
  "--epr-picker-border-color": "transparent",
  "--epr-highlight-color": "#002187",
} as CSSProperties;

const DARK_COLORS = {
  "--epr-bg-color": "#07194f",
  "--epr-category-label-bg-color": "#07194f",
  "--epr-picker-border-color": "transparent",
  "--epr-search-input-bg-color": "#1e293b",
  "--epr-hover-bg-color": "rgba(255, 255, 255, 0.1)",
  "--epr-focus-bg-color": "rgba(255, 255, 255, 0.1)",
  "--epr-highlight-color": "#C4D600",
} as CSSProperties;

const LABELS = {
  searchPlaceholder: "Buscar emoji",
  searchLabel: "Buscar emoji",
  searchClear: "Limpar busca",
  searchResultsNone: "Nenhum emoji encontrado",
  searchResultsOne: "1 emoji encontrado",
  searchResultsMany: "%n emojis encontrados",
  categoryNavigation: "Categorias de emoji",
  loading: "Carregando emojis...",
  loadingError: "Não foi possível carregar os emojis.",
  retryLoading: "Tentar novamente",
};

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isDarkTheme = () => document.documentElement.classList.contains("dark");

export function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  const dark = useSyncExternalStore(subscribeToTheme, isDarkTheme, () => false);
  return (
    <div className="w-[340px] max-w-full">
      <EmojiPicker
        onEmojiClick={(data) => onPick(data.emoji)}
        emojiData={emojisPt}
        emojiStyle={EmojiStyle.NATIVE}
        theme={dark ? Theme.DARK : Theme.LIGHT}
        style={dark ? DARK_COLORS : LIGHT_COLORS}
        labels={LABELS}
        previewConfig={{ showPreview: false }}
        lazyLoadEmojis
        width="100%"
        height={400}
      />
    </div>
  );
}
