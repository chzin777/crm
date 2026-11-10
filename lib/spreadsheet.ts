import * as XLSX from "xlsx";

/** Planilha lida como linhas de texto (primeira aba). Só no servidor. */
export type SheetRows = string[][];

/** Número da célula em texto sem notação científica nem casas decimais vazias (CPF/telefone numéricos). */
const cellText = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("en-US", { useGrouping: false }) : String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/^﻿/, "").trim();
};

/** Lê .xlsx ou .csv com o SheetJS e devolve as linhas da primeira aba. */
export function parseSpreadsheet(fileName: string, buffer: Buffer): SheetRows {
  if (/\.xls$/i.test(fileName)) throw new Error("Formato .xls antigo não suportado. Salve como .xlsx ou .csv.");
  let workbook: XLSX.WorkBook;
  try {
    const isCsv = /\.(csv|txt)$/i.test(fileName) && buffer.readUInt32LE(0) !== 0x04034b50;
    // CSV: texto UTF-8 (com ou sem BOM); se não for UTF-8 válido, o Excel em português salva em Windows-1252.
    const text = isCsv ? buffer.toString("utf8") : "";
    workbook = isCsv
      ? XLSX.read(text.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : text.replace(/^﻿/, ""), { type: "string", raw: true })
      : XLSX.read(buffer, { type: "buffer" });
  } catch {
    throw new Error("Não foi possível ler a planilha. Confira se o arquivo é .xlsx ou .csv válido.");
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error("A planilha não tem nenhuma aba com dados.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: false });
  return rows
    .map((row) => row.map(cellText))
    .filter((row) => row.some((value) => value !== ""));
}
