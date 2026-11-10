import { inflateRawSync } from "node:zlib";

/** Planilha lida como linhas de texto (a primeira aba no caso do .xlsx). Só no servidor. */
export type SheetRows = string[][];

/* ---------- CSV ---------- */

function decodeText(buffer: Buffer) {
  const utf8 = buffer.toString("utf8");
  // Planilhas salvas pelo Excel em português costumam vir em Windows-1252.
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

export function parseCsv(buffer: Buffer): SheetRows {
  const text = decodeText(buffer).replace(/^﻿/, "");
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = [";", ",", "\t"].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best, ";");

  const rows: SheetRows = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((line) => line.some((value) => value.trim() !== ""));
}

/* ---------- XLSX (zip + XML, sem dependências) ---------- */

function readZip(buffer: Buffer) {
  const files = new Map<string, Buffer>();
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("Arquivo .xlsx inválido ou corrompido.");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(dataStart, dataStart + size);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, inflateRawSync(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const decodeXml = (value: string) => value
  .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const textOf = (xml: string) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("");

const columnIndex = (ref: string) => {
  const letters = ref.replace(/[^A-Z]/gi, "").toUpperCase();
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
};

/** Número do Excel em texto sem notação científica ("6.2981234567E10" → "62981234567"). */
const numberText = (value: string) => {
  if (!/e/i.test(value)) return value;
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 10 }) : value;
};

export function parseXlsx(buffer: Buffer): SheetRows {
  const files = readZip(buffer);
  const read = (name: string) => files.get(name)?.toString("utf8");

  const shared = [...(read("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => textOf(match[1]));

  // Primeira aba do arquivo, seguindo o vínculo do workbook (com folha1 como reserva).
  let sheetPath = "xl/worksheets/sheet1.xml";
  const firstSheetId = read("xl/workbook.xml")?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const rels = read("xl/_rels/workbook.xml.rels");
  if (firstSheetId && rels) {
    const relation = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((match) => match[0]).find((tag) => tag.includes(`Id="${firstSheetId}"`));
    const target = relation?.match(/Target="([^"]+)"/)?.[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = read(sheetPath) ?? [...files.keys()].filter((name) => name.startsWith("xl/worksheets/")).map(read).find(Boolean);
  if (!sheet) throw new Error("A planilha não tem nenhuma aba com dados.");

  const rows: SheetRows = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/i)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (raw !== undefined) value = type === "str" || type === "b" ? decodeXml(raw) : numberText(decodeXml(raw));
      row[ref ? columnIndex(ref) : row.length] = value;
    }
    rows.push(Array.from(row, (value) => value ?? ""));
  }
  return rows.filter((line) => line.some((value) => value.trim() !== ""));
}

export function parseSpreadsheet(fileName: string, buffer: Buffer): SheetRows {
  const isZip = buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50;
  if (/\.xlsx$/i.test(fileName) || isZip) return parseXlsx(buffer);
  if (/\.xls$/i.test(fileName)) throw new Error("Formato .xls antigo não suportado. Salve como .xlsx ou .csv.");
  return parseCsv(buffer);
}
