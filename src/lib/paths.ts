/**
 * Base-path helpers. The site is served under the `base` set in
 * astro.config.mjs (currently "/animal-passport"), so every internal link
 * and every reference to a file in public/ must be prefixed with it.
 *
 * `import.meta.env.BASE_URL` reflects the configured base, so if the base
 * ever changes (or is removed), these helpers pick it up automatically.
 */
const base = import.meta.env.BASE_URL.replace(/\/+$/, "");

/** Prefix a root-relative path ("/about", "/fonts/Inter.woff2") with the site base. */
export function withBase(path: string): string {
  if (!path.startsWith("/")) return path;
  return path === "/" ? `${base}/` : `${base}${path}`;
}

/** Remove the site base from a pathname (for active-link comparisons). */
export function stripBase(pathname: string): string {
  return pathname.startsWith(base)
    ? pathname.slice(base.length) || "/"
    : pathname;
}
