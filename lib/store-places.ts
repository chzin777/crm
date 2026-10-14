export function normalizePlace(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizePlaceList(values: string[]) {
  return Array.from(new Set(values.map(normalizePlace).filter(Boolean)));
}
