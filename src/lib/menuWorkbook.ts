import { unzipSync } from "fflate";

export type ParsedMenuWorkbookDay = {
  day_number: number;
  weekday: string | null;
  breakfast: string[];
  lunch: string[];
  dinner: string[];
  notes: string | null;
};

const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MENU_SHEET_NAME = "28 Day Menu";
const MAX_WORKBOOK_BYTES = 12 * 1024 * 1024;
const MEAL_HEADINGS = new Set(["BREAKFAST", "BRUNCH", "LUNCH", "DINNER", "SUPPER"]);
const BAD_ITEMS = new Set(["", "0", "#N/A", "#REF!", "#VALUE!", "#NAME?", "REF!", "SOUP OF THE DAY", "SPUP OF THE DAY", "VEGETARIAN"]);

function parseXml(xml: string, label: string): XMLDocument {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error(`Could not read ${label} from workbook.`);
  return doc;
}

function textFromZip(files: Record<string, Uint8Array>, path: string): string {
  const bytes = files[path];
  if (!bytes) throw new Error(`Workbook is missing ${path}.`);
  return new TextDecoder().decode(bytes);
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/^\/+/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function resolveWorkbookTarget(target: string): string {
  return normalizePath(target.startsWith("/") ? target : `xl/${target}`);
}

function cellColumnIndex(ref: string): number {
  const letters = ref.replace(/[^A-Za-z]/g, "").toUpperCase();
  let n = 0;
  for (const letter of letters) n = n * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, n - 1);
}

function parseSharedStrings(files: Record<string, Uint8Array>): string[] {
  if (!files["xl/sharedStrings.xml"]) return [];
  const doc = parseXml(textFromZip(files, "xl/sharedStrings.xml"), "shared strings");
  return Array.from(doc.getElementsByTagName("si"), (si) => si.textContent ?? "");
}

function cellText(cell: Element, sharedStrings: string[]): string {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") return cell.getElementsByTagName("is")[0]?.textContent?.trim() ?? "";
  const raw = cell.getElementsByTagName("v")[0]?.textContent?.trim() ?? "";
  if (type === "s") return sharedStrings[Number(raw)]?.trim() ?? "";
  if (type === "e") return raw.startsWith("#") ? raw : `#${raw}`;
  return raw;
}

function sheetRows(files: Record<string, Uint8Array>, sheetPath: string, sharedStrings: string[]): string[][] {
  const doc = parseXml(textFromZip(files, sheetPath), sheetPath);
  const rows: string[][] = [];

  for (const row of Array.from(doc.getElementsByTagName("row"))) {
    const rowNumber = Number(row.getAttribute("r") ?? rows.length + 1);
    const values = rows[rowNumber - 1] ?? [];
    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      values[cellColumnIndex(cell.getAttribute("r") ?? "")] = cellText(cell, sharedStrings);
    }
    rows[rowNumber - 1] = values;
  }

  return rows;
}

function menuSheetPath(files: Record<string, Uint8Array>): string {
  const workbook = parseXml(textFromZip(files, "xl/workbook.xml"), "workbook metadata");
  const rels = parseXml(textFromZip(files, "xl/_rels/workbook.xml.rels"), "workbook relationships");
  const relTargets = new Map<string, string>();

  for (const rel of Array.from(rels.getElementsByTagName("Relationship"))) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target) relTargets.set(id, resolveWorkbookTarget(target));
  }

  for (const sheet of Array.from(workbook.getElementsByTagName("sheet"))) {
    const name = sheet.getAttribute("name") ?? "";
    if (name.toLowerCase() !== MENU_SHEET_NAME.toLowerCase()) continue;
    const relId = sheet.getAttribute("r:id") ?? sheet.getAttributeNS(REL_NS, "id");
    const target = relId ? relTargets.get(relId) : null;
    if (target) return target;
  }

  throw new Error(`Workbook needs a "${MENU_SHEET_NAME}" sheet.`);
}

function cleanCell(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value: string | undefined): string {
  return cleanCell(value).toUpperCase();
}

function dayNumber(value: string | undefined): number | null {
  const match = normalized(value).match(/\bDAY\s*(\d{1,2})\b/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) ? n : null;
}

function isMealHeading(value: string | undefined): boolean {
  return MEAL_HEADINGS.has(normalized(value).replace(/\s+OK$/, ""));
}

function isUsableItem(value: string): boolean {
  const key = normalized(value);
  if (BAD_ITEMS.has(key)) return false;
  if (key.startsWith("#")) return false;
  if (key.startsWith("DAY ")) return false;
  if (MEAL_HEADINGS.has(key)) return false;
  return true;
}

function uniqueItems(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const item = cleanCell(value);
    const key = normalized(item);
    if (!isUsableItem(item) || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function itemsBetween(rows: string[][], col: number, start: number, end: number): string[] {
  const values: string[] = [];
  for (let row = start; row < end; row += 1) values.push(rows[row]?.[col] ?? "");
  return uniqueItems(values);
}

function parseMenuRows(rows: string[][]): ParsedMenuWorkbookDay[] {
  const headerRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.slice(0, 7).some((cell) => {
      const day = dayNumber(cell);
      return day !== null && day >= 1 && day <= 28;
    }))
    .map(({ index }) => index);

  const byDay = new Map<number, ParsedMenuWorkbookDay>();

  for (let blockIndex = 0; blockIndex < headerRows.length; blockIndex += 1) {
    const headerRow = headerRows[blockIndex];
    const nextHeaderRow = headerRows[blockIndex + 1] ?? rows.length;

    for (let col = 0; col < 7; col += 1) {
      const day = dayNumber(rows[headerRow]?.[col]);
      if (day === null || day < 1 || day > 28) continue;

      const mealRows: number[] = [];
      for (let row = headerRow + 2; row < nextHeaderRow; row += 1) {
        if (isMealHeading(rows[row]?.[col])) mealRows.push(row);
      }
      if (mealRows.length < 3) continue;

      byDay.set(day, {
        day_number: day,
        weekday: cleanCell(rows[headerRow + 1]?.[col]) || null,
        breakfast: itemsBetween(rows, col, mealRows[0] + 1, mealRows[1]),
        lunch: itemsBetween(rows, col, mealRows[1] + 1, mealRows[2]),
        dinner: itemsBetween(rows, col, mealRows[2] + 1, nextHeaderRow),
        notes: null,
      });
    }
  }

  const parsed = Array.from(byDay.values()).sort((a, b) => a.day_number - b.day_number);
  const missing = Array.from({ length: 28 }, (_, i) => i + 1).filter((day) => !byDay.has(day));
  if (parsed.length !== 28 || missing.length) {
    throw new Error(`Found ${parsed.length}/28 menu days. Missing: ${missing.join(", ") || "unknown"}.`);
  }
  return parsed;
}

export async function parseMenuWorkbook(file: File): Promise<ParsedMenuWorkbookDay[]> {
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    throw new Error("Upload an .xlsx or .xlsm workbook with a 28 Day Menu sheet.");
  }
  if (file.size > MAX_WORKBOOK_BYTES) {
    throw new Error("Workbook is too large. Use a cafeteria menu workbook under 12 MB.");
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("Could not open that workbook. Upload a real .xlsx or .xlsm file.");
  }
  const sharedStrings = parseSharedStrings(files);
  return parseMenuRows(sheetRows(files, menuSheetPath(files), sharedStrings));
}
