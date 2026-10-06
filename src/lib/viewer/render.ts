/**
 * Builds the readable view of a passport. Every piece of sender text goes in
 * through textContent, except noteText, which goes through sanitizeHtml.
 */
import type { LoadedPassport, MediaFile } from "./package";
import { sanitizeHtml, looksLikeHtml, htmlToSearchText } from "./sanitize";
import {
  label, typeLabel, typeGroup, TYPE_GROUPS, OTHER_GROUP, num, unit, amount, isAmount, isRating, rating, isFacility, facility,
  isAnimals, animals, isDescribed, described, isDrug, drug, dateTime, dayOf, timeOf,
  parseAudit, token, schedule, duration, doseText, humanSize, population,
} from "./format";

/* ------------------------------------------------------------------ */
/* Small DOM helpers                                                   */
/* ------------------------------------------------------------------ */

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string | null,
  text?: string | null
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

function badge(text: string, tone: "teal" | "amber" | "coral" | "muted" = "muted"): HTMLElement {
  return h("span", `pv-badge pv-badge-${tone}`, text);
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp", avif: "image/avif",
};

function ext(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export interface Item {
  obj: any;
  /** Configuration list (ranges, processes, behaviors) or a record. */
  group: string | null;
  el?: HTMLElement;
  text?: string;
}

export interface Section {
  type: string;
  items: Item[];
  recordCount: number;
  manifestCount: number | null;
  details: HTMLDetailsElement;
  list: HTMLElement;
  countEl: HTMLElement;
  rendered: number;
  pending: boolean;
}

export interface RefTarget {
  section: Section | null;
  obj: any;
  id: string;
  /** Top-level record type, for link text. */
  type: string;
  /** True for a top-level record (not a nested dose, finding...). */
  top: boolean;
}

export class Viewer {
  sections: Section[] = [];
  sectionByType = new Map<string, Section>();
  refs = new Map<string, RefTarget>();
  mediaRecords = new Map<string, any>();
  private urls = new Map<string, Promise<string>>();
  /** Image loads in flight, so printing can wait for them. */
  imageLoads: Promise<unknown>[] = [];
  private allUrls: string[] = [];
  private terms: string[] = [];
  private usedIds = new Set<string>();

  constructor(
    public pkg: LoadedPassport,
    private onOpenImage: (url: string, caption: string) => void
  ) {}

  get root(): any {
    return this.pkg.doc.animalPassport;
  }

  get records(): any {
    const r = this.root.records;
    return r && typeof r === "object" ? r : {};
  }

  /** Free every object URL this view created. */
  dispose() {
    for (const u of this.allUrls) URL.revokeObjectURL(u);
    this.allUrls = [];
    this.urls.clear();
  }

  /* ---------------- indexing ---------------- */

  private idFor(ref: string): string {
    let base = "r-" + ref.replace(/[^A-Za-z0-9_-]/g, "_");
    let id = base;
    let n = 2;
    while (this.usedIds.has(id)) id = `${base}-${n++}`;
    this.usedIds.add(id);
    return id;
  }

  private indexRefs(obj: any, type: string, section: Section | null, top: boolean) {
    const walk = (o: any) => {
      if (Array.isArray(o)) {
        o.forEach(walk);
        return;
      }
      if (!o || typeof o !== "object") return;
      if (typeof o.originRef === "string" && !this.refs.has(o.originRef)) {
        this.refs.set(o.originRef, { section, obj: o, id: this.idFor(o.originRef), type, top: top && o === obj });
      }
      for (const [k, v] of Object.entries(o)) if (k !== "extensions") walk(v);
    };
    walk(obj);
  }

  /** The anchor id for an object, only for the first object carrying that originRef. */
  private anchorId(o: any): string | null {
    if (!o || typeof o.originRef !== "string") return null;
    const t = this.refs.get(o.originRef);
    return t && t.obj === o ? t.id : null;
  }

  /* ---------------- links ---------------- */

  refLink(ref: string, text?: string): HTMLElement {
    const t = this.refs.get(ref);
    if (!t) {
      const span = h("span", "pv-ref-missing", text ? `${text} ` : "");
      span.appendChild(h("span", "pv-muted", `${text ? "(" : ""}${ref}, not in this file${text ? ")" : ""}`));
      return span;
    }
    const a = h("a", "pv-ref", text || this.describeRef(t));
    a.href = `#${t.id}`;
    a.dataset.ref = ref;
    return a;
  }

  private describeRef(t: RefTarget): string {
    if (t.top) {
      const { title, date } = titleFor(t.type, t.obj);
      const kind = typeLabelSingular(t.type);
      return [title.startsWith(kind) ? "" : kind, title, date].filter(Boolean).join(" · ");
    }
    const o = t.obj;
    const name = o.name ?? o.finding ?? o.testMethod ?? o.description ?? o.complication ?? o.behavior;
    return name ? String(name) : t.id.replace(/^r-/, "");
  }

  /* ---------------- media ---------------- */

  findMedia(name: string): MediaFile | undefined {
    return this.pkg.media.get(name) ?? this.pkg.mediaLower.get(name.toLowerCase());
  }

  private objectUrl(file: MediaFile): Promise<string> {
    let p = this.urls.get(file.name);
    if (!p) {
      p = file.read().then((bytes) => {
        const e = ext(file.name);
        const type = IMAGE_TYPES[e] ?? (e === "pdf" ? "application/pdf" : "application/octet-stream");
        // Only allow-listed image types and PDF keep a viewable type, so an
        // HTML or SVG file in the zip can never render in this page's origin.
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
        this.allUrls.push(url);
        return url;
      });
      this.urls.set(file.name, p);
    }
    return p;
  }

  mediaList(names: string[]): HTMLElement {
    const wrap = h("div", "pv-media");
    for (const name of names) {
      if (typeof name !== "string") continue;
      const file = this.findMedia(name);
      const rec = this.mediaRecords.get(name) ?? this.mediaRecords.get(name.toLowerCase());
      const caption = rec?.description ? String(rec.description) : "";
      if (file && IMAGE_TYPES[ext(name)]) {
        const btn = h("button", "pv-thumb");
        btn.type = "button";
        btn.title = `Open ${name} full size`;
        const img = h("img");
        img.alt = caption || name;
        img.loading = "lazy";
        btn.appendChild(img);
        const cap = h("span", "pv-thumb-cap", caption ? `${caption} · ${name}` : name);
        btn.appendChild(cap);
        const load = this.objectUrl(file).then(
          (url) => {
            img.src = url;
            btn.addEventListener("click", () => this.onOpenImage(url, cap.textContent ?? name));
          },
          () => {
            img.remove();
            cap.textContent = `${name} - could not be read from the zip`;
          }
        );
        this.imageLoads.push(load);
        wrap.appendChild(btn);
      } else if (file) {
        const btn = h("button", "pv-file");
        btn.type = "button";
        btn.textContent = `${caption ? caption + " · " : ""}${name} (${humanSize(file.size)})`;
        btn.title = `Save ${name}`;
        btn.addEventListener("click", async () => {
          try {
            const url = await this.objectUrl(file);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
          } catch {
            btn.textContent = `${name} - could not be read from the zip`;
          }
        });
        wrap.appendChild(btn);
      } else {
        const span = h("span", "pv-file-missing", `${caption ? caption + " · " : ""}${name}`);
        span.appendChild(h("span", "pv-muted", this.pkg.kind === "zip" ? " - not in this file" : " - not in this file (a bare JSON file carries no media)"));
        wrap.appendChild(span);
      }
    }
    return wrap;
  }

  /* ---------------- values ---------------- */

  /** Inline rendering of one value; null when there is nothing to show. */
  value(key: string, v: any, parent: any): Node | null {
    if (isEmpty(v)) return null;
    if (typeof v === "boolean") return document.createTextNode(v ? "Yes" : "No");
    if (typeof v === "number") return document.createTextNode(String(v));
    if (typeof v === "string") {
      if (key === "noteText") return this.note(v);
      if (key === "fileName") return this.mediaList([v]);
      if (/Refs?$/.test(key) && key !== "ref") return this.refLink(v);
      if (/DateTime$/.test(key) || key === "dateTime") return h("span", "pv-nowrap", dateTime(v));
      if (key === "population") return document.createTextNode(population(v));
      if (key === "audit") return document.createTextNode(auditText(v));
      if (key === "unit" || key === "perUnit") return document.createTextNode(unit(v));
      if (TOKEN_KEYS.has(key)) return document.createTextNode(token(v));
      if (/^(low|high|mean|score)$/.test(key)) return document.createTextNode(num(v));
      return textNode(v);
    }
    if (Array.isArray(v)) return this.array(key, v, parent);
    if (typeof v === "object") return this.object(key, v);
    return document.createTextNode(String(v));
  }

  private note(text: string): HTMLElement {
    const div = h("div", "pv-note");
    if (looksLikeHtml(text)) {
      div.appendChild(sanitizeHtml(text));
      // An embedded record that names its originRef links to that record.
      for (const block of Array.from(div.querySelectorAll<HTMLElement>(".pv-embedded[data-ref]"))) {
        const ref = block.dataset.ref!;
        if (!this.refs.has(ref)) continue;
        const p = h("p", "pv-embedded-ref");
        p.appendChild(this.refLink(ref, "Open this record"));
        block.appendChild(p);
      }
    } else {
      div.classList.add("pv-plain");
      div.textContent = text;
    }
    return div;
  }

  private object(key: string, o: any): Node | null {
    if (key === "extensions") return document.createTextNode(flatten(o));
    if ((key === "frequency" || key === "schedule") && o.pattern) return document.createTextNode(schedule(o));
    if (key === "duration" && (o.untilFurtherNotice || ["days", "doses", "weeks", "months", "hours"].includes(o.unit))) {
      return document.createTextNode(duration(o).replace(/^for /, ""));
    }
    if (isAmount(o)) return document.createTextNode(amount(o));
    if (isRating(o)) return document.createTextNode(rating(o));
    if (isFacility(o)) return document.createTextNode(facility(o));
    if (isAnimals(o)) return document.createTextNode(animals(o));
    if (isDrug(o)) {
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createTextNode(drug(o)));
      if (o.concentration) {
        const c = o.concentration;
        const conc = c.description || [amount(c), c.deliveryForm && `per ${c.deliveryForm}`].filter(Boolean).join(" ");
        if (conc) frag.appendChild(h("span", "pv-muted", ` · ${conc}`));
      }
      return frag;
    }
    if (key === "measureCode" && typeof o.description === "string") return document.createTextNode(o.description);
    if (isDescribed(o)) {
      const extra = Object.entries(o)
        .filter(([k, v]) => k !== "description" && !isEmpty(v) && v !== o.description)
        .map(([, v]) => String(v));
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createTextNode(described(o)));
      if (extra.length) frag.appendChild(h("span", "pv-muted", ` (${extra.join(", ")})`));
      return frag;
    }
    const keys = Object.keys(o);
    if (keys.length && keys.every((k) => k === "low" || k === "high" || k === "mean")) {
      return document.createTextNode(rangeText(o));
    }
    // Anything else: a nested definition list.
    return this.fields(o);
  }

  private array(key: string, arr: any[], parent: any): Node | null {
    if (arr.every((x) => typeof x !== "object" || x === null)) {
      const vals = arr.filter((x) => !isEmpty(x));
      if (!vals.length) return null;
      if (key === "media") return this.mediaList(vals as string[]);
      if (/Refs$/.test(key)) {
        const span = h("span", "pv-reflist");
        vals.forEach((r, i) => {
          if (i) span.appendChild(document.createTextNode(", "));
          span.appendChild(this.refLink(String(r)));
        });
        return span;
      }
      const strs = vals.map((x) => (TOKEN_KEYS.has(key) ? token(x) : typeof x === "boolean" ? (x ? "Yes" : "No") : String(x)));
      if (strs.some((s) => s.length > 50)) {
        const ul = h("ul", "pv-list");
        for (const s of strs) ul.appendChild(h("li", null, s));
        return ul;
      }
      // Names written "Last, First" need a stronger separator.
      return document.createTextNode(strs.join(strs.some((x) => x.includes(",")) ? "; " : ", "));
    }
    const objs = arr.filter((x) => x && typeof x === "object");
    if (key === "doses") return this.doses(objs);
    if (key === "findings") return this.findings(objs);
    if (key === "ids" && objs.every((o) => "value" in o)) return this.table(objs, ["scheme", "role", "facility", "value"]);
    if (objs.every(isFlat)) return this.table(objs);
    const wrap = h("div", "pv-subs");
    void parent;
    for (const o of objs) {
      if (key === "drugUse" && o.drug && typeof o.drug === "object") {
        // Drug name as the title; concentration and type on a line under it.
        const type = o.prescriptionType || o.anestheticType;
        const c = o.drug.concentration;
        const conc = c ? c.description || amount(c) : "";
        const b = this.block(o, drug(o.drug), new Set(["drug", "prescriptionType", "anestheticType"]));
        const line = [conc, type].filter(Boolean).join(" · ");
        if (line) b.insertBefore(h("p", "pv-muted pv-small", line), b.children[1] ?? null);
        wrap.appendChild(b);
      } else {
        wrap.appendChild(this.block(o, subTitle(key, o)));
      }
    }
    return wrap;
  }

  private doses(ds: any[]): HTMLElement {
    const ul = h("ul", "pv-doses");
    for (const d of ds) {
      const li = h("li", null, doseText(d) || "Dose");
      const id = this.anchorId(d);
      if (id) li.id = id;
      // Anything the sentence does not cover.
      const rest = Object.fromEntries(
        Object.entries(d).filter(([k]) => !["originRef", "dose", "drugAmount", "doseRate", "administration", "frequency", "duration"].includes(k))
      );
      if (!isEmpty(rest)) li.appendChild(this.fields(rest));
      ul.appendChild(li);
    }
    return ul;
  }

  private findings(fs: any[]): HTMLElement {
    const known = new Set(["originRef", "finding", "result", "reference", "audit"]);
    const extra: string[] = [];
    for (const f of fs) for (const k of Object.keys(f)) if (!known.has(k) && !extra.includes(k)) extra.push(k);
    const wrap = h("div", "pv-table-wrap");
    const t = h("table", "pv-table");
    const head = t.createTHead().insertRow();
    for (const c of ["Finding", "Result", "Reference range", ...extra.map(label)]) head.appendChild(h("th", null, c));
    const body = t.createTBody();
    for (const f of fs) {
      const tr = body.insertRow();
      const id = this.anchorId(f);
      if (id) tr.id = id;
      tr.appendChild(h("td", null, f.finding ?? ""));
      const res = h("td");
      res.textContent = f.result ? amount(f.result) : "";
      const flag = outOfRange(f);
      if (flag) {
        tr.classList.add("pv-flagged");
        res.appendChild(document.createTextNode(" "));
        res.appendChild(badge(flag, "coral"));
      }
      tr.appendChild(res);
      const ref = h("td", "pv-muted");
      if (f.reference) {
        ref.textContent = rangeText(f.reference);
      }
      tr.appendChild(ref);
      for (const k of extra) {
        const td = h("td");
        const n = this.value(k, f[k], f);
        if (n) td.appendChild(n);
        tr.appendChild(td);
      }
    }
    wrap.appendChild(t);
    return wrap;
  }

  private table(objs: any[], order?: string[]): HTMLElement {
    const cols: string[] = order ? order.filter((c) => objs.some((o) => !isEmpty(o[c]))) : [];
    for (const o of objs) for (const k of Object.keys(o)) if (k !== "originRef" && k !== "audit" && !cols.includes(k) && objs.some((x) => !isEmpty(x[k]))) cols.push(k);
    if (objs.some((o) => o.audit)) cols.push("audit");
    // A name beside its ref (behavior + behaviorRef) shows as one linked column.
    const paired = cols.filter((c) => /Ref$/.test(c) && cols.includes(c.slice(0, -3)));
    for (const p of paired) cols.splice(cols.indexOf(p), 1);
    const wrap = h("div", "pv-table-wrap");
    const t = h("table", "pv-table");
    const head = t.createTHead().insertRow();
    for (const c of cols) head.appendChild(h("th", null, c === "audit" ? "Entered" : label(c)));
    const body = t.createTBody();
    for (const o of objs) {
      const tr = body.insertRow();
      const id = this.anchorId(o);
      if (id) tr.id = id;
      for (const c of cols) {
        const td = h("td", c === "audit" ? "pv-muted pv-small" : null);
        const n = paired.includes(c + "Ref") && typeof o[c + "Ref"] === "string"
          ? this.refLink(o[c + "Ref"], isEmpty(o[c]) ? undefined : String(o[c]))
          : this.value(c, o[c], o);
        if (n) td.appendChild(n);
        tr.appendChild(td);
      }
    }
    wrap.appendChild(t);
    return wrap;
  }

  /** A definition list of an object's fields. */
  fields(o: any, skip: Set<string> = new Set()): HTMLElement {
    const dl = h("dl", "pv-fields");
    const extensions: string[] = [];
    // A name beside its ref (process + processRef) shows as one link.
    const pairedRefs = new Set<string>();
    for (const k of Object.keys(o)) {
      if (/Ref$/.test(k) && typeof o[k] === "string" && typeof o[k.slice(0, -3)] === "string") pairedRefs.add(k);
    }
    for (const [k, v] of Object.entries(o)) {
      if (skip.has(k) || META_KEYS.has(k) || pairedRefs.has(k)) continue;
      if (k === "extensions") {
        if (!isEmpty(v)) extensions.push(flatten(v));
        continue;
      }
      let node: Node | null;
      if (pairedRefs.has(k + "Ref")) node = this.refLink(o[k + "Ref"], String(v));
      else node = this.value(k, v, o);
      if (!node) continue;
      const row = h("div", "pv-field");
      // Blocks, tables, notes and media take the full width under their label.
      if (node instanceof HTMLElement && WIDE.some((c) => node!.classList?.contains(c))) row.classList.add("pv-field-wide");
      row.appendChild(h("dt", null, label(k)));
      const dd = h("dd");
      dd.appendChild(node);
      row.appendChild(dd);
      dl.appendChild(row);
    }
    if (extensions.length) {
      const row = h("div", "pv-field pv-field-wide pv-other");
      row.appendChild(h("dt", null, "Other data"));
      row.appendChild(h("dd", null, extensions.join("; ")));
      dl.appendChild(row);
    }
    return dl;
  }

  /** The muted line under a record: who entered it, where, its reference. */
  meta(o: any): HTMLElement | null {
    const bits: string[] = [];
    if (o.recordedAt) bits.push(`Recorded at ${isFacility(o.recordedAt) ? facility(o.recordedAt) : String(o.recordedAt)}`);
    if (o.audit) bits.push(auditText(o.audit));
    if (o.originRef) bits.push(`Ref ${o.originRef}`);
    if (!bits.length) return null;
    return h("p", "pv-meta", bits.join(" · "));
  }

  /** A nested object (sample, test, meal, anesthetic...) as a small block. */
  block(o: any, title: string | null, skip?: Set<string>): HTMLElement {
    const div = h("div", "pv-sub");
    const id = this.anchorId(o);
    if (id) div.id = id;
    div.appendChild(h("p", "pv-sub-title", title ?? ""));
    if (!title) div.firstElementChild!.remove();
    div.appendChild(this.fields(o, skip));
    const m = this.meta(o);
    if (m) div.appendChild(m);
    return div;
  }

  /* ---------------- records ---------------- */

  record(type: string, o: any, group: string | null): HTMLElement {
    const art = h("article", "pv-record");
    const id = this.anchorId(o);
    if (id) art.id = id;
    if (group) {
      art.classList.add("pv-config");
      art.appendChild(this.fields(o));
      const m = this.meta(o);
      if (m) art.appendChild(m);
      return art;
    }
    const { title, date, badges } = titleFor(type, o);
    const head = h("header", "pv-record-head");
    const ht = h("h4", "pv-record-title", title);
    for (const b of badges) {
      ht.appendChild(document.createTextNode(" "));
      ht.appendChild(badge(b.text, b.tone));
    }
    head.appendChild(ht);
    if (date) head.appendChild(h("span", "pv-record-date", date));
    art.appendChild(head);
    art.appendChild(this.fields(o));
    const m = this.meta(o);
    if (m) art.appendChild(m);
    return art;
  }

  /* ---------------- sections ---------------- */

  /** Create every section (empty), grouped by kind (TYPE_GROUPS) and alphabetical within a group. */
  buildSections(container: HTMLElement) {
    const records = this.records;
    const contents: any[] = Array.isArray(this.root.manifest?.contents) ? this.root.manifest.contents : [];
    const order: { type: string; manifestCount: number | null }[] = [];
    for (const c of contents) {
      if (c && typeof c.recordType === "string" && !order.some((x) => x.type === c.recordType)) {
        order.push({ type: c.recordType, manifestCount: typeof c.recordCount === "number" ? c.recordCount : null });
      }
    }
    for (const k of Object.keys(records)) if (!order.some((x) => x.type === k)) order.push({ type: k, manifestCount: null });

    const groupRank = (type: string) => {
      const i = TYPE_GROUPS.findIndex((g) => g.title === typeGroup(type));
      return i === -1 ? TYPE_GROUPS.length : i;
    };
    order.sort((a, b) => groupRank(a.type) - groupRank(b.type) || typeLabel(a.type).localeCompare(typeLabel(b.type)));

    // Media descriptions, by file name, for captions anywhere in the file.
    if (Array.isArray(records.media)) {
      for (const m of records.media) {
        if (m && typeof m.fileName === "string") {
          this.mediaRecords.set(m.fileName, m);
          this.mediaRecords.set(m.fileName.toLowerCase(), m);
        }
      }
    }

    const groupSizes = new Map<string, number>();
    for (const { type } of order) groupSizes.set(typeGroup(type), (groupSizes.get(typeGroup(type)) ?? 0) + 1);

    let currentGroup: string | null = null;
    for (const { type, manifestCount } of order) {
      const group = typeGroup(type);
      if (group !== currentGroup) {
        // A heading over a single section would only repeat its name.
        if ((groupSizes.get(group) ?? 0) > 1) {
          container.appendChild(h("h3", "pv-type-group", group === OTHER_GROUP ? "Other records" : group));
        }
        currentGroup = group;
      }
      const items = itemsFor(records[type]);
      const details = h("details", "pv-section");
      details.id = `sec-${type}`;
      const summary = h("summary", "pv-section-summary");
      summary.appendChild(h("span", "pv-section-name", typeLabel(type)));
      const recordCount = items.filter((i) => !i.group).length;
      const countEl = h("span", "pv-section-count", countText(recordCount, manifestCount, records[type] === undefined));
      summary.appendChild(countEl);
      details.appendChild(summary);
      const list = h("div", "pv-section-body");
      details.appendChild(list);
      const sec: Section = { type, items, recordCount, manifestCount, details, list, countEl, rendered: 0, pending: false };
      if (!items.length) {
        list.appendChild(
          h("p", "pv-muted", records[type] === undefined
            ? "Listed in the manifest, but the file has no records of this type."
            : "None. The sender included this record type and there are no records of it.")
        );
      }
      details.addEventListener("toggle", () => {
        if (details.open) this.renderChunked(sec);
      });
      this.sections.push(sec);
      this.sectionByType.set(type, sec);
      container.appendChild(details);
      for (const it of items) this.indexRefs(it.obj, type, sec, !it.group);
    }
  }

  /** Render the next records of a section; returns true when all are rendered. */
  renderMore(sec: Section, n: number): boolean {
    const end = Math.min(sec.items.length, sec.rendered + n);
    const frag = document.createDocumentFragment();
    const hasConfig = sec.items.length > 0 && sec.items[0].group !== null;
    for (let i = sec.rendered; i < end; i++) {
      const it = sec.items[i];
      const prev = i > 0 ? sec.items[i - 1] : null;
      if (hasConfig && (i === 0 || prev?.group !== it.group)) {
        frag.appendChild(h("h3", "pv-group-title", it.group ? label(it.group) : "Records"));
      }
      it.el = this.record(sec.type, it.obj, it.group);
      if (this.terms.length && !this.matches(it)) it.el.classList.add("pv-nomatch");
      frag.appendChild(it.el);
    }
    sec.list.appendChild(frag);
    sec.rendered = end;
    return end >= sec.items.length;
  }

  /** Render a section a slice at a time so a large one does not freeze the page. */
  renderChunked(sec: Section) {
    if (sec.pending || sec.rendered >= sec.items.length) return;
    sec.pending = true;
    // About 12 ms of work per slice, then yield so the page can paint and
    // respond. setTimeout rather than requestAnimationFrame, so rendering
    // still finishes when the tab is in the background.
    const step = () => {
      if (!sec.pending) return; // finished synchronously in the meantime
      const t0 = performance.now();
      let done = false;
      while (!done && performance.now() - t0 < 12) done = this.renderMore(sec, 20);
      if (done) sec.pending = false;
      else setTimeout(step, 0);
    };
    step();
  }

  renderAllNow(sec: Section) {
    this.renderMore(sec, Infinity);
    sec.pending = false;
  }

  /** Open the record holding an originRef and scroll to it. */
  goTo(ref: string) {
    const t = this.refs.get(ref);
    if (!t) return;
    if (t.section) {
      this.renderAllNow(t.section);
      t.section.details.open = true;
      // A search may have hidden it.
      const el0 = document.getElementById(t.id);
      el0?.closest(".pv-nomatch")?.classList.remove("pv-nomatch");
      t.section.details.classList.remove("pv-nomatch");
    }
    const el = document.getElementById(t.id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.remove("pv-flash");
    void el.offsetWidth;
    el.classList.add("pv-flash");
  }

  /* ---------------- search ---------------- */

  private matches(it: Item): boolean {
    if (it.text === undefined) it.text = searchText(it.obj).toLowerCase();
    return this.terms.every((t) => it.text!.includes(t));
  }

  /** Filter every record; returns the number of matching records. */
  search(query: string): number | null {
    this.terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
    if (!this.terms.length) {
      for (const sec of this.sections) {
        sec.details.classList.remove("pv-nomatch");
        sec.countEl.textContent = countText(sec.recordCount, sec.manifestCount, false);
        for (const it of sec.items) it.el?.classList.remove("pv-nomatch");
      }
      return null;
    }
    let total = 0;
    for (const sec of this.sections) {
      let hits = 0;
      for (const it of sec.items) if (this.matches(it)) hits++;
      if (hits) {
        // Records already on the page are filtered now; the rest are
        // filtered as they render (renderMore checks the terms).
        for (const it of sec.items) it.el?.classList.toggle("pv-nomatch", !this.matches(it));
        this.renderChunked(sec);
        sec.details.classList.remove("pv-nomatch");
        sec.details.open = true;
        sec.countEl.textContent = `${hits} of ${sec.items.length} match`;
      } else {
        sec.details.classList.add("pv-nomatch");
      }
      total += hits;
    }
    return total;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers used by the viewer and the summary                          */
/* ------------------------------------------------------------------ */

const META_KEYS = new Set(["originRef", "audit", "recordedAt"]);

const WIDE = ["pv-subs", "pv-table-wrap", "pv-fields", "pv-media", "pv-note", "pv-doses"];

const TOKEN_KEYS = new Set([
  "status", "scheme", "role", "administration", "unknownReason", "current", "initial",
  "animalType", "pattern",
]);

function textNode(s: string): Node {
  // Long multi-line text keeps its line breaks.
  if (s.includes("\n")) return h("span", "pv-plain", s);
  return document.createTextNode(s);
}

export function auditText(a: unknown): string {
  const p = parseAudit(a);
  if (!p) return "";
  if (p.when && p.who) return `Entered ${dateTime(p.when)} by ${p.who}`;
  if (p.when) return `Entered ${dateTime(p.when)}`;
  return `Entered by ${p.who}`;
}

function flatten(o: any, prefix = ""): string {
  if (o === null || typeof o !== "object") return `${prefix}${prefix ? ": " : ""}${String(o)}`;
  const out: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(flatten(v, p));
    else out.push(`${p}: ${Array.isArray(v) ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") : String(v)}`);
  }
  return out.join("; ");
}

function rangeText(r: any): string {
  const lo = num(r.low);
  const hi = num(r.high);
  let s = lo && hi ? `${lo}–${hi}` : lo ? `from ${lo}` : hi ? `up to ${hi}` : "";
  if (r.mean) s += `${s ? " " : ""}(mean ${num(r.mean)})`;
  return s;
}

function outOfRange(f: any): string {
  const v = parseFloat(f?.result?.value);
  if (!f?.reference || !/^\s*-?\d+(\.\d+)?\s*$/.test(String(f?.result?.value ?? ""))) return "";
  const lo = parseFloat(f.reference.low);
  const hi = parseFloat(f.reference.high);
  if (!isNaN(lo) && v < lo) return "Low";
  if (!isNaN(hi) && v > hi) return "High";
  return "";
}

function isFlat(o: any): boolean {
  return Object.entries(o).every(([k, v]) => {
    if (k === "noteText" || k === "media") return false;
    if (v === null || typeof v !== "object") return typeof v !== "string" || v.length < 160;
    if (Array.isArray(v)) return v.every((x) => x === null || typeof x !== "object");
    if (k === "extensions") return true;
    return isAmount(v) || isRating(v) || isFacility(v) || isAnimals(v) || isDescribed(v) || isDrug(v);
  });
}

function subTitle(key: string, o: any): string | null {
  if (key === "samples") return [o.sampleType, o.sampleId && `sample ${o.sampleId}`].filter(Boolean).join(" · ") || "Sample";
  if (key === "tests") return [o.testMethod, o.lab, o.currentStatus].filter(Boolean).join(" · ") || "Test";
  if (key === "anesthetics") return [o.givenDateTime && dateTime(o.givenDateTime), o.delivery, o.injectionRoute].filter(Boolean).join(" · ") || "Anesthetic";
  if (key === "reviews") return [o.reviewDateTime && dateTime(o.reviewDateTime), rating(o.rating)].filter(Boolean).join(" · ") || "Review";
  if (key === "notes") return null;
  const name = o.name ?? o.question ?? o.title ?? o.description;
  return typeof name === "string" ? name : null;
}

function itemsFor(v: any): Item[] {
  if (Array.isArray(v)) return sortNewest(v, true).map((obj) => ({ obj, group: null }));
  if (v && typeof v === "object") {
    // A grouped type: configuration lists plus `records`.
    const items: Item[] = [];
    for (const [k, list] of Object.entries(v)) {
      if (k === "records" || !Array.isArray(list)) continue;
      for (const obj of list) if (obj && typeof obj === "object") items.push({ obj, group: k });
    }
    if (Array.isArray(v.records)) for (const obj of sortNewest(v.records)) items.push({ obj, group: null });
    return items;
  }
  return [];
}

export function sortNewest(list: any[], primaryFirst = false): any[] {
  const keyed = list
    .filter((x) => x && typeof x === "object")
    .map((obj, i) => ({ obj, i, t: timeOf(dateKeyOf(obj)) }));
  keyed.sort((a, b) => {
    if (primaryFirst) {
      const pa = a.obj.primary === true ? 1 : 0;
      const pb = b.obj.primary === true ? 1 : 0;
      if (pa !== pb) return pb - pa;
    }
    const an = isNaN(a.t), bn = isNaN(b.t);
    if (an && bn) return a.i - b.i;
    if (an) return 1;
    if (bn) return -1;
    return b.t - a.t || a.i - b.i;
  });
  return keyed.map((k) => k.obj);
}

const DATE_KEYS = [
  "recordDateTime", "recordDate", "openedDateTime", "startDate", "treatmentStartDate",
  "reviewDateTime", "fileDateTime", "givenDateTime", "statusDate",
];

export function dateKeyOf(o: any): string {
  for (const k of DATE_KEYS) if (typeof o?.[k] === "string" && o[k]) return o[k];
  const a = parseAudit(o?.audit);
  return a?.when ?? "";
}

function countText(n: number, manifest: number | null, missing: boolean): string {
  if (missing) return manifest ? `${manifest} listed, none found` : "none";
  let s = n === 0 ? "none" : `${n} record${n === 1 ? "" : "s"}`;
  if (manifest !== null && manifest !== n) s += ` (manifest says ${manifest})`;
  return s;
}

function typeLabelSingular(type: string): string {
  const map: Record<string, string> = {
    cases: "Case", transactions: "Transaction", prescriptions: "Prescription", anesthesias: "Anesthesia",
    labCollections: "Lab collection", measurements: "Measurements", diets: "Diet", necropsies: "Necropsy",
    medicalAlerts: "Medical alert", chronicConditions: "Chronic condition", drugReactions: "Drug reaction",
    contraceptions: "Contraception", welfareAssessments: "Welfare assessment", clinicalNotes: "Clinical note",
    animalNotes: "Animal note", nutritionNotes: "Nutrition note", physiologicalReadings: "Physiological reading",
    identifiers: "Identifier", media: "Media", feedings: "Feeding", digitalImaging: "Digital imaging",
    actionPlans: "Action plan", observations: "Observation", enrichment: "Enrichment", training: "Training",
  };
  return map[type] ?? typeLabel(type);
}

type Tone = "teal" | "amber" | "coral" | "muted";

/** Type-specific title line for a top-level record. */
export function titleFor(type: string, o: any): { title: string; date: string; badges: { text: string; tone: Tone }[] } {
  const badges: { text: string; tone: Tone }[] = [];
  const date = dayOf(dateKeyOf(o));
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  let title = "";
  switch (type) {
    case "sexHistory":
      title = s(o.sex);
      break;
    case "identifiers":
      title = [s(o.identifierType), s(o.value)].filter(Boolean).join(": ");
      if (o.primary === true) badges.push({ text: "Primary", tone: "teal" });
      if (o.removalDateTime) badges.push({ text: "Removed", tone: "muted" });
      break;
    case "parents": {
      const id = Array.isArray(o.ids) ? (o.ids.find((x: any) => x.scheme === "gan") ?? o.ids[0]) : null;
      title = [s(o.parentType), s(o.taxon), id ? s(id.value) : ""].filter(Boolean).join(" · ");
      if (o.unknownReason) badges.push({ text: token(o.unknownReason), tone: "muted" });
      break;
    }
    case "rearings":
      title = s(o.rearingType);
      break;
    case "populations":
      title = [s(o.lifeStage), s(o.population)].filter(Boolean).join(": ");
      break;
    case "transactions":
      title = s(o.transactionType?.description ?? o.transactionType);
      break;
    case "animalNotes":
    case "clinicalNotes":
    case "nutritionNotes":
      title = s(o.category) || "Note";
      break;
    case "cases":
      title = `Case ${[o.caseNumber, o.caseYear].filter(Boolean).join("/")}` +
        (o.caseType ? ` · ${o.caseType}` : "") + (o.workingDiagnosis ? ` · ${o.workingDiagnosis}` : "");
      if (o.status) badges.push({ text: token(o.status), tone: o.status === "open" ? "amber" : "muted" });
      break;
    case "medicalAlerts":
      title = s(o.alertText) || "Medical alert";
      if (o.alertLevel) badges.push({ text: s(o.alertLevel), tone: "coral" });
      badges.push(o.closedDateTime ? { text: "Closed", tone: "muted" } : { text: "Open", tone: "amber" });
      break;
    case "chronicConditions":
      title = s(o.condition);
      if (o.status) badges.push({ text: s(o.status), tone: /^active$/i.test(o.status) ? "amber" : "muted" });
      break;
    case "drugReactions":
      title = drug(o.drug) || "Drug reaction";
      if (o.reactionLevel) badges.push({ text: s(o.reactionLevel), tone: "coral" });
      break;
    case "prescriptions": {
      const drugs = Array.isArray(o.drugUse) ? o.drugUse.map((d: any) => d?.drug?.name).filter(Boolean) : [];
      title = drugs.length ? drugs[0] + (drugs.length > 1 ? ` and ${drugs.length - 1} more` : "") : "Prescription";
      if (o.status) badges.push({ text: token(o.status), tone: isActiveRx(o) ? "amber" : "muted" });
      break;
    }
    case "anesthesias":
      title = `Anesthesia ${[o.number, o.year].filter(Boolean).join("/")}` + (o.reason ? ` · ${o.reason}` : "");
      break;
    case "labCollections":
      title = s(o.collectionReason) || "Lab collection";
      break;
    case "measurements": {
      const ms = Array.isArray(o.measurements) ? o.measurements : [];
      title = ms.map((m: any) => `${m.measureCode?.description ?? "Measure"} ${amount(m.quantity)}`).join(", ") || "Measurements";
      break;
    }
    case "physiologicalReadings": {
      const ds = Array.isArray(o.details) ? o.details : [];
      title = ds.map((d: any) => `${d.type ?? ""} ${amount(d.result)}`.trim()).join(", ") || "Physiological reading";
      break;
    }
    case "contraceptions":
      title = s(o.contraceptionType) || "Contraception";
      if (o.status) badges.push({ text: token(o.status), tone: o.status === "active" ? "amber" : "muted" });
      break;
    case "observations":
      title = [s(o.observationType), rating(o.value)].filter(Boolean).join(": ");
      break;
    case "enrichment":
      title = s(o.process) || "Enrichment";
      if (o.levelRating) badges.push({ text: rating(o.levelRating), tone: "muted" });
      break;
    case "training": {
      const bs = Array.isArray(o.sessionBehaviors) ? o.sessionBehaviors.map((b: any) => b.behavior).filter(Boolean) : [];
      title = bs.length ? bs.join(", ") : "Training session";
      if (o.sessionRating) badges.push({ text: rating(o.sessionRating), tone: "muted" });
      break;
    }
    case "welfareAssessments":
      title = s(o.protocol) || "Welfare assessment";
      if (o.score !== undefined && o.score !== null) badges.push({ text: `Score ${num(o.score)}`, tone: "teal" });
      break;
    case "actionPlans":
      title = [s(o.referenceNumber), s(o.category), s(o.reason)].filter(Boolean).join(" · ") || "Action plan";
      if (o.status) badges.push({ text: token(o.status), tone: "muted" });
      break;
    case "digitalImaging":
      title = s(o.description) || "Digital imaging";
      break;
    case "diets":
      title = s(o.name) || "Diet";
      badges.push(o.endDate ? { text: `Ended ${o.endDate}`, tone: "muted" } : { text: "Current", tone: "teal" });
      break;
    case "media":
      title = s(o.description) || s(o.fileName) || "Media";
      break;
    case "feedings": {
      const items = Array.isArray(o.items) ? o.items.map((i: any) => i.feedItem).filter(Boolean) : [];
      title = items.length ? items.slice(0, 3).join(", ") + (items.length > 3 ? ` and ${items.length - 3} more` : "") : "Feeding";
      break;
    }
    case "necropsies":
      title = `Necropsy ${[o.necropsyNumber, o.necropsyYear].filter(Boolean).join("/")}`;
      break;
    default: {
      const k = ["name", "title", "description", "type", "category", "value"].find((x) => typeof o[x] === "string" && o[x]);
      title = k ? o[k] : typeLabelSingular(type);
    }
  }
  return { title: title || typeLabelSingular(type), date, badges };
}

export function isActiveRx(o: any): boolean {
  // Draft 0.1 names prescribed / dispensed / closed; the samples write "active".
  const st = String(o?.status ?? "").toLowerCase();
  return st === "active" || st === "prescribed" || st === "dispensed";
}

/** Every string and number in a record, for search. */
function searchText(o: any): string {
  const out: string[] = [];
  const walk = (v: any, key: string) => {
    if (v === null || v === undefined) return;
    if (typeof v === "string") out.push(key === "noteText" ? htmlToSearchText(v) : v);
    else if (typeof v === "number" || typeof v === "boolean") out.push(String(v));
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(o, "");
  return out.join(" \u0001 ");
}
