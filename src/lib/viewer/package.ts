/**
 * Opens a passport package: a zip holding passport.json plus media/, or a
 * bare JSON file. Everything happens in memory in the browser.
 */
import { ZipReader, looksLikeZip, type ZipEntry } from "./zip";

export interface MediaFile {
  name: string;
  size: number;
  /** Decompressed bytes, read on demand. */
  read: () => Promise<Uint8Array>;
}

export interface LoadedPassport {
  doc: any;
  fileName: string;
  kind: "zip" | "json";
  /** Media files by bare file name (and a lower-case index for a tolerant lookup). */
  media: Map<string, MediaFile>;
  mediaLower: Map<string, MediaFile>;
  warnings: string[];
}

export class PassportError extends Error {}

function parseJson(bytes: Uint8Array, label: string): any {
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new PassportError(`${label} is not valid JSON (${(e as Error).message}).`);
  }
}

function checkShape(doc: any) {
  if (!doc || typeof doc !== "object" || !doc.animalPassport || typeof doc.animalPassport !== "object") {
    throw new PassportError(
      "This file does not look like an Animal Passport: there is no animalPassport object at the top level."
    );
  }
}

export async function openPassport(buf: ArrayBuffer, fileName: string): Promise<LoadedPassport> {
  const warnings: string[] = [];
  const media = new Map<string, MediaFile>();
  const mediaLower = new Map<string, MediaFile>();

  if (!looksLikeZip(buf)) {
    const doc = parseJson(new Uint8Array(buf), fileName || "The file");
    checkShape(doc);
    return { doc, fileName, kind: "json", media, mediaLower, warnings };
  }

  const zip = new ZipReader(buf);
  for (const s of zip.skipped) warnings.push(`Skipped ${s.name} in the zip (${s.reason}).`);

  let entries = zip.entries.filter((e) => !e.name.startsWith("__MACOSX/") && !/(^|\/)\.DS_Store$/.test(e.name));

  // A zip made by compressing a folder has one extra top-level folder. If
  // nothing sits at the root and everything shares one folder, strip it.
  const isRoot = (n: string) => !n.includes("/");
  if (!entries.some((e) => isRoot(e.name))) {
    const tops = new Set(entries.map((e) => e.name.split("/")[0]));
    if (tops.size === 1) {
      const prefix = [...tops][0] + "/";
      entries = entries.map((e) => ({ ...e, name: e.name.slice(prefix.length) }));
    }
  }

  const rootJson = entries.filter((e) => isRoot(e.name) && /\.json$/i.test(e.name));
  let main: ZipEntry | undefined = rootJson.find((e) => e.name.toLowerCase() === "passport.json");
  if (!main) {
    if (rootJson.length === 1) {
      main = rootJson[0];
      warnings.push(`No passport.json at the root of the zip; read ${main.name} instead.`);
    } else if (rootJson.length > 1) {
      throw new PassportError(
        `The zip has no passport.json at its root, and ${rootJson.length} other JSON files, so the viewer cannot tell which one is the passport.`
      );
    } else {
      throw new PassportError("The zip has no passport.json at its root.");
    }
  }

  const doc = parseJson(await zip.read(main), main.name);
  checkShape(doc);

  // Media: files under media/ first; files at the root as a fallback.
  const add = (bare: string, e: ZipEntry, overwrite: boolean) => {
    if (!overwrite && media.has(bare)) return;
    const f: MediaFile = { name: bare, size: e.size, read: () => zip.read(e) };
    media.set(bare, f);
    if (overwrite || !mediaLower.has(bare.toLowerCase())) mediaLower.set(bare.toLowerCase(), f);
  };
  for (const e of entries) {
    if (e === main) continue;
    if (isRoot(e.name)) add(e.name, e, false);
  }
  for (const e of entries) {
    const m = /^media\/([^/]+)$/i.exec(e.name);
    if (m) add(m[1], e, true);
  }

  return { doc, fileName, kind: "zip", media, mediaLower, warnings };
}
