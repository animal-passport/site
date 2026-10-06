/**
 * Sender text can carry HTML. It is never injected as-is: it is parsed into
 * an inert document with DOMParser (scripts do not run and images do not load
 * there), then rebuilt element by element into fresh nodes from a short
 * allowlist, with every attribute dropped. Anything not on the list is either
 * removed with its content (scripts, styles, embedded objects) or unwrapped so
 * its text survives (links, fonts, unknown tags).
 */

const ALLOWED = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li",
  "div", "span", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "blockquote", "pre", "code", "sub", "sup",
]);

const HEADINGS: Record<string, string> = { h1: "h4", h2: "h4", h3: "h4", h4: "h5", h5: "h5", h6: "h5" };

/** Removed together with everything inside them. */
const DROP = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "img", "picture",
  "source", "video", "audio", "track", "canvas", "svg", "math", "template", "noscript", "link",
  "meta", "base", "title", "head", "form", "input", "button", "select", "option", "textarea",
  "dialog", "map", "area", "portal",
]);

/** Plain text when there is nothing that looks like a tag. */
export function looksLikeHtml(s: string): boolean {
  // Only real tag names count, so "weight <60 kg" or "<not a tag" stays plain text.
  return /<\/?(p|br|hr|div|span|ul|ol|li|b|strong|i|em|u|s|h[1-6]|table|thead|tbody|tfoot|tr|td|th|blockquote|pre|code|sub|sup|font|a|img|script|style|iframe|object|embed|svg)(\s[^<>]*)?\/?>|&(nbsp|amp|lt|gt|quot|#\d+);/i.test(s);
}

function copyChildren(from: Node, to: Node) {
  for (const child of Array.from(from.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      to.appendChild(document.createTextNode(child.textContent ?? ""));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue; // comments, processing instructions
    const el = child as Element;
    const tag = el.localName.toLowerCase();
    if (DROP.has(tag)) continue;
    let out: HTMLElement | null = null;
    if (ALLOWED.has(tag)) out = document.createElement(tag);
    else if (HEADINGS[tag]) out = document.createElement(HEADINGS[tag]);
    if (out) {
      // The attributes we set ourselves: mark records embedded in a note, and
      // keep the originRef of the record (data-ref) as plain data for a link.
      if (tag === "div" && el.hasAttribute("data-record")) {
        out.className = "pv-embedded";
        const ref = el.getAttribute("data-ref");
        if (ref) out.dataset.ref = ref;
      }
      copyChildren(el, out);
      to.appendChild(out);
    } else {
      copyChildren(el, to); // unwrap
    }
  }
}

/** Returns a fragment holding a sanitised copy of the HTML. */
export function sanitizeHtml(html: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const frag = document.createDocumentFragment();
  copyChildren(parsed.body, frag);
  return frag;
}

/** Rough text of HTML for search only (never rendered). */
export function htmlToSearchText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}
