/**
 * Wires the viewer page: file picker, drag and drop, samples, search,
 * expand / collapse, print, and the image lightbox.
 */
import { openPassport, PassportError } from "./package";
import { ZipError } from "./zip";
import { Viewer, h } from "./render";
import { buildHeader, buildDayOne } from "./summary";

function $(root: ParentNode, sel: string): HTMLElement {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`viewer: missing ${sel}`);
  return el as HTMLElement;
}

export function initViewer(app: HTMLElement) {
  const drop = $(app, "[data-pv-drop]");
  const input = $(app, "[data-pv-input]") as HTMLInputElement;
  const status = $(app, "[data-pv-status]");
  const out = $(app, "[data-pv-output]");
  const toolbar = $(app, "[data-pv-toolbar]");
  const search = $(app, "[data-pv-search]") as HTMLInputElement;
  const count = $(app, "[data-pv-count]");
  const dialog = $(app, "[data-pv-lightbox]") as HTMLDialogElement;
  const dialogImg = $(dialog, "img") as HTMLImageElement;
  const dialogCap = $(dialog, "[data-pv-caption]");

  let viewer: Viewer | null = null;
  let loading = false;

  const setStatus = (msg: string, kind: "info" | "error" = "info") => {
    status.textContent = msg;
    status.classList.toggle("pv-status-error", kind === "error");
    status.hidden = !msg;
  };

  const openImage = (url: string, caption: string) => {
    dialogImg.src = url;
    dialogImg.alt = caption;
    dialogCap.textContent = caption;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else window.open(url, "_blank", "noopener");
  };
  dialog.addEventListener("click", (e) => {
    // A click on the backdrop (the dialog itself) or the close button closes it.
    const t = e.target as HTMLElement;
    if (t === dialog || t.closest("[data-pv-close]")) dialog.close();
  });

  async function load(buf: ArrayBuffer, fileName: string) {
    if (loading) return;
    loading = true;
    setStatus(`Reading ${fileName}...`);
    try {
      const pkg = await openPassport(buf, fileName);
      viewer?.dispose();
      viewer = new Viewer(pkg, openImage);
      render(viewer);
      setStatus("");
      drop.classList.add("pv-drop-compact");
      out.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      const msg = e instanceof PassportError || e instanceof ZipError ? e.message : `The file could not be read (${(e as Error).message}).`;
      setStatus(msg, "error");
    } finally {
      loading = false;
    }
  }

  function render(v: Viewer) {
    out.replaceChildren();
    search.value = "";
    count.textContent = "";

    const doc = v.pkg.doc;
    const notices = h("div", "pv-notices");
    const specVersion = v.root.manifest?.specVersion;
    if (specVersion && String(specVersion) !== "0.1") {
      notices.appendChild(h("p", "pv-notice", `This file says it follows spec version ${specVersion}. The viewer was written for version 0.1; it displays every field, including fields it does not recognize.`));
    }
    if (typeof doc._note === "string" && doc._note) {
      const p = h("p", "pv-notice");
      p.appendChild(h("strong", null, "Note in the file: "));
      p.appendChild(document.createTextNode(doc._note));
      notices.appendChild(p);
    }
    for (const w of v.pkg.warnings) notices.appendChild(h("p", "pv-notice", w));

    const printHead = h("p", "pv-print-only pv-print-head",
      `Animal Passport, readable copy from the reference viewer at animalpassport.org. Printed ${new Date().toISOString().slice(0, 10)} from ${v.pkg.fileName}. The passport file itself is the record.`);

    const sections = h("div", "pv-sections");
    v.buildSections(sections);

    const fullHead = h("div", "pv-full-head");
    fullHead.appendChild(h("h2", "pv-h2", "Full record"));
    const fullNote = h("p", "pv-muted pv-small", "Every record type in the file, grouped by kind, with the newest records first.");
    fullNote.appendChild(h("span", "pv-noprint", " Open a section to read it, or search them all."));
    fullHead.appendChild(fullNote);

    out.append(printHead);
    if (notices.childElementCount) out.append(notices);
    out.append(buildHeader(v), buildDayOne(v), fullHead, toolbar, sections);
    toolbar.hidden = false;
  }

  /* ---------------- file input, drop, samples ---------------- */

  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    if (f) await load(await f.arrayBuffer(), f.name);
    input.value = "";
  });

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  // Stop the browser from opening a file dropped anywhere on the page.
  window.addEventListener("dragover", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  drop.addEventListener("dragenter", (e) => {
    if (hasFiles(e)) drop.classList.add("pv-drop-over");
  });
  drop.addEventListener("dragover", (e) => {
    if (hasFiles(e)) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      drop.classList.add("pv-drop-over");
    }
  });
  drop.addEventListener("dragleave", (e) => {
    if (!drop.contains(e.relatedTarget as Node)) drop.classList.remove("pv-drop-over");
  });
  drop.addEventListener("drop", async (e) => {
    drop.classList.remove("pv-drop-over");
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    await load(await f.arrayBuffer(), f.name);
  });

  const sampleButtons = Array.from(app.querySelectorAll<HTMLButtonElement>("[data-pv-sample]"));
  for (const btn of sampleButtons) {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.pvSample!;
      try {
        setStatus("Loading the sample...");
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await load(await res.arrayBuffer(), url.split("/").pop() || "sample.json");
      } catch (e) {
        setStatus(`The sample could not be loaded (${(e as Error).message}).`, "error");
      }
    });
  }

  // ?sample=pebble opens that sample on arrival, so other pages can link straight to it.
  // Only a sample offered on the page can be named, never an arbitrary URL.
  const wanted = new URLSearchParams(location.search).get("sample");
  if (wanted) sampleButtons.find((b) => b.dataset.pvSample!.endsWith(`/${wanted}.json`))?.click();

  /* ---------------- links inside the view ---------------- */

  out.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a || !viewer) return;
    if (a.dataset.ref) {
      e.preventDefault();
      viewer.goTo(a.dataset.ref);
    } else if (a.dataset.section) {
      e.preventDefault();
      const sec = viewer.sectionByType.get(a.dataset.section);
      if (!sec) return;
      viewer.renderChunked(sec);
      sec.details.open = true;
      sec.details.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  /* ---------------- toolbar ---------------- */

  let timer = 0;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!viewer) return;
      const n = viewer.search(search.value.trim());
      count.textContent = n === null ? "" : n === 0 ? "No records match" : n === 1 ? "1 record matches" : `${n} records match`;
    }, 200);
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && search.value) {
      search.value = "";
      search.dispatchEvent(new Event("input"));
    }
  });

  $(app, "[data-pv-expand]").addEventListener("click", () => {
    viewer?.sections.forEach((s) => {
      if (!s.details.classList.contains("pv-nomatch")) s.details.open = true;
    });
  });
  $(app, "[data-pv-collapse]").addEventListener("click", () => {
    viewer?.sections.forEach((s) => (s.details.open = false));
  });

  /* ---------------- print ---------------- */

  let saved: boolean[] | null = null;
  const beforePrint = () => {
    if (!viewer || saved) return;
    saved = viewer.sections.map((s) => s.details.open);
    for (const s of viewer.sections) {
      viewer.renderAllNow(s);
      s.details.open = true;
    }
    for (const img of out.querySelectorAll("img")) img.loading = "eager";
  };
  const afterPrint = () => {
    if (!viewer || !saved) return;
    viewer.sections.forEach((s, i) => (s.details.open = saved![i]));
    saved = null;
  };
  window.addEventListener("beforeprint", beforePrint);
  window.addEventListener("afterprint", afterPrint);
  $(app, "[data-pv-print]").addEventListener("click", async () => {
    if (!viewer) return;
    beforePrint();
    // Wait for the images to come out of the zip, then a moment to decode.
    await Promise.allSettled(viewer.imageLoads);
    setTimeout(() => window.print(), 150);
  });
}
