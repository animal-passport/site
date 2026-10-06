/** The specification lives on GitHub, not on this site. */
export const SPEC_HREF = "https://github.com/animal-passport/spec";

/** Spread onto a link that leaves the site - it opens in a new tab: <a href={x} {...NEW_TAB}>. */
export const NEW_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;

/** True for a link to another site. */
export const isExternal = (href: string) => /^https?:\/\//.test(href);
