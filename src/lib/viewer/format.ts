/**
 * Text formatting for passport values: labels, units, amounts, dates,
 * schedules and doses. Pure functions, no DOM.
 */

export const TYPE_LABELS: Record<string, string> = {
  sexHistory: "Sex history",
  identifiers: "Identifiers",
  parents: "Parents",
  rearings: "Rearing",
  populations: "Population",
  transactions: "Transactions",
  animalNotes: "Animal notes",
  cases: "Cases",
  clinicalNotes: "Clinical notes",
  nutritionNotes: "Nutrition notes",
  medicalAlerts: "Medical alerts",
  chronicConditions: "Chronic conditions",
  drugReactions: "Drug reactions",
  prescriptions: "Prescriptions",
  anesthesias: "Anesthesia",
  labCollections: "Lab collections",
  measurements: "Measurements",
  physiologicalReadings: "Physiological readings",
  contraceptions: "Contraception",
  observations: "Observations",
  enrichment: "Enrichment",
  training: "Training",
  welfareAssessments: "Welfare assessments",
  actionPlans: "Action plans",
  digitalImaging: "Digital imaging",
  diets: "Diets",
  media: "Media",
  feedings: "Feedings",
  necropsies: "Necropsies",
};

/**
 * The groups the viewer lists record types under, in this order - the same groups the
 * home page uses. Within a group, record types are listed alphabetically by label.
 * A record type not named here goes under "Other", last. A group gets a heading only
 * when the file has more than one of its record types.
 */
export const TYPE_GROUPS: { title: string; types: string[] }[] = [
  { title: "Identity", types: ["identifiers", "parents", "populations", "rearings", "sexHistory"] },
  {
    title: "Medical",
    types: [
      "anesthesias", "cases", "chronicConditions", "clinicalNotes", "digitalImaging", "drugReactions",
      "labCollections", "medicalAlerts", "necropsies", "prescriptions",
    ],
  },
  {
    title: "Husbandry",
    types: ["contraceptions", "diets", "enrichment", "feedings", "measurements", "nutritionNotes", "physiologicalReadings"],
  },
  { title: "Welfare and behavior", types: ["actionPlans", "animalNotes", "observations", "welfareAssessments"] },
  { title: "Training", types: ["training"] },
  { title: "Transaction history", types: ["transactions"] },
  { title: "Media", types: ["media"] },
];

export const OTHER_GROUP = "Other";

/** The group a record type is listed under. */
export function typeGroup(type: string): string {
  return TYPE_GROUPS.find((g) => g.types.includes(type))?.title ?? OTHER_GROUP;
}

const LABELS: Record<string, string> = {
  gan: "GAN",
  localId: "Local ID",
  localIds: "Local IDs",
  labLocalId: "Lab local ID",
  sampleId: "Sample ID",
  equipmentId: "Equipment ID",
  otherId: "Other ID",
  externalId: "External ID",
  buoyPotId: "Buoy / pot ID",
  ids: "IDs",
  taxonIds: "Taxon IDs",
  latLonType: "Lat/long type",
  latLonEstimated: "Lat/long estimated",
  bpCuff: "BP cuff",
  ageAtDeathDays: "Age at death (days)",
  sha256: "SHA-256",
  mediaType: "Media type",
  fileName: "File name",
  noteText: "Note",
  caseRef: "Case",
  anesthesiaRef: "Anesthesia",
  weightRef: "Weight",
  estimatedWeightRef: "Estimated weight",
  deathTransactionRef: "Death transaction",
  acquisitionTransactionRef: "Acquisition transaction",
  labTestRefs: "Lab tests",
  measurementRefs: "Measurements",
  drugUse: "Drugs",
  ownerAfterTransaction: "Owner after transaction",
  holderAfterTransaction: "Holder after transaction",
  recordedAt: "Recorded at",
  geo: "Location",
  measureCode: "Measure",
  inZooSinceDate: "In zoo since",
};

const DATETIME_LABELS: Record<string, string> = {
  record: "Date",
  review: "Reviewed",
  removal: "Removed",
  file: "File date",
  status: "Status date",
  "": "Date",
};

/** camelCase key -> "Sentence case" label. */
export function label(key: string): string {
  if (LABELS[key]) return LABELS[key];
  if (key === "recordDate") return "Date";
  if (key === "dateTime") return "Date";
  if (key.endsWith("DateTime")) {
    const base = key.slice(0, -8);
    return DATETIME_LABELS[base] ?? label(base);
  }
  let k = key;
  if (/Refs?$/.test(k) && k.length > 4) k = k.replace(/Refs?$/, (m) => (m === "Refs" ? "s" : ""));
  const words = k
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? label(type);
}

/** "61.4000" -> "61.4"; leaves anything that is not a plain decimal alone. */
export function num(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (/^-?\d+\.\d+$/.test(s)) return s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

const UNIT_MAP: Record<string, string> = {
  Cel: "°C",
  "[degF]": "°F",
  "[iU]": "IU",
  "[IU]": "IU",
  "mm[Hg]": "mmHg",
  "[lb_av]": "lb",
  "[oz_av]": "oz",
  "[in_i]": "in",
  "[ft_i]": "ft",
  "[ppm]": "ppm",
  "[pH]": "pH",
  uL: "µL",
  ug: "µg",
  um: "µm",
  umol: "µmol",
  "/min": "/min",
};

/** A UCUM (or source) unit spelled for people. */
export function unit(u: unknown): string {
  if (u === null || u === undefined) return "";
  let s = String(u);
  if (UNIT_MAP[s]) return UNIT_MAP[s];
  s = s
    .replace(/\[degF\]/g, "°F")
    .replace(/\bCel\b/g, "°C")
    .replace(/\[iU\]/gi, "IU")
    .replace(/mm\[Hg\]/g, "mmHg")
    .replace(/\[([^\]_]+)(_[^\]]*)?\]/g, "$1")
    .replace(/\{([^}]*)\}/g, "$1")
    .replace(/10\*(\d+)/g, (_m, d: string) => "10" + d.split("").map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c]).join(""))
    .replace(/(^|\/)u(L|g|mol|m)\b/g, "$1µ$2");
  return s;
}

/** {value, unit, perUnit} -> "0.1 mg/kg". */
export function amount(a: any): string {
  if (a === null || a === undefined) return "";
  if (typeof a !== "object") return num(a);
  const v = num(a.value);
  const u = unit(a.unit);
  let s = v;
  if (u) s += u === "%" || u.startsWith("/") ? u : ` ${u}`;
  if (a.perUnit) s += `/${unit(a.perUnit)}`;
  return s.trim();
}

export function isAmount(o: any): boolean {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const keys = Object.keys(o);
  return "value" in o && keys.every((k) => k === "value" || k === "unit" || k === "perUnit") &&
    (typeof o.value === "string" || typeof o.value === "number");
}

export function isRating(o: any): boolean {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const keys = Object.keys(o);
  return keys.length > 0 && keys.every((k) => k === "score" || k === "display");
}

export function rating(o: any): string {
  if (!o) return "";
  if (typeof o !== "object") return String(o);
  return o.display ?? o.score ?? "";
}

export function isFacility(o: any): boolean {
  if (!o || typeof o !== "object" || Array.isArray(o) || typeof o.name !== "string") return false;
  return Object.keys(o).every((k) => k === "name" || k === "institutionCode" || k === "mnemonic");
}

export function facility(o: any): string {
  if (!o) return "";
  if (typeof o === "string") return o;
  const code = [o.mnemonic, o.institutionCode].filter(Boolean).join(", ");
  return code ? `${o.name} (${code})` : o.name ?? "";
}

export function isAnimals(o: any): boolean {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  return "count" in o && Object.keys(o).every((k) => k === "count" || k === "localIds");
}

export function animals(o: any): string {
  const ids = Array.isArray(o.localIds) ? o.localIds.join(", ") : "";
  return `${o.count} animal${o.count === 1 || o.count === "1" ? "" : "s"}${ids ? `: ${ids}` : ""}`;
}

/** Objects like transactionType {description, category} or measureCode {description, unitType}. */
export function isDescribed(o: any): boolean {
  if (!o || typeof o !== "object" || Array.isArray(o) || typeof o.description !== "string") return false;
  return Object.values(o).every((v) => v === null || typeof v !== "object");
}

export function described(o: any): string {
  return o.description;
}

export function isDrug(o: any): boolean {
  return !!o && typeof o === "object" && !Array.isArray(o) && typeof o.name === "string" &&
    ("genericName" in o || "shortName" in o || "concentration" in o);
}

export function drug(o: any): string {
  if (!o) return "";
  let s = o.name ?? o.shortName ?? o.genericName ?? "";
  if (o.genericName && o.genericName.toLowerCase() !== String(s).toLowerCase()) s += ` (${o.genericName})`;
  return s;
}

const DT_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** As written, local to where it was recorded: "2026-09-20 09:05 (UTC-07:00)". */
export function dateTime(s: unknown): string {
  if (typeof s !== "string") return s === null || s === undefined ? "" : String(s);
  const m = DT_RE.exec(s.trim());
  if (!m) return s;
  let zone = "";
  if (m[5] === "Z") zone = " (UTC)";
  else if (m[5]) zone = ` (UTC${m[5].length === 5 ? m[5].slice(0, 3) + ":" + m[5].slice(3) : m[5]})`;
  return `${m[1]} ${m[2]}:${m[3]}${zone}`;
}

/** The date part of a date or date-time, for title lines. */
export function dayOf(s: unknown): string {
  if (typeof s !== "string") return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : s;
}

/** Sort key (ms since epoch) for a date or date-time string; NaN when unknown. */
export function timeOf(s: unknown): number {
  if (typeof s !== "string" || !s) return NaN;
  return Date.parse(s);
}

/** "2026-09-20T09:52:18-07:00 Okafor, Grace" -> {when, who}. */
export function parseAudit(a: unknown): { when: string; who: string } | null {
  if (typeof a !== "string" || !a.trim()) return null;
  const m = /^(\S+)\s+(.*)$/.exec(a.trim());
  if (m && DT_RE.test(m[1])) return { when: m[1], who: m[2] };
  if (DT_RE.test(a.trim())) return { when: a.trim(), who: "" };
  return { when: "", who: a.trim() };
}

const TOKENS: Record<string, string> = {
  live: "Live",
  dead: "Dead",
  preBirth: "Pre-birth",
  open: "Open",
  closed: "Closed",
  active: "Active",
  inactive: "Inactive",
  prescribed: "Prescribed",
  dispensed: "Dispensed",
  inProgress: "In progress",
  unsubmitted: "Unsubmitted",
  pending: "Pending",
  approved: "Approved",
  completed: "Completed",
  canceled: "Canceled",
  sentOut: "Sent out",
  resultsIn: "Results in",
  requested: "Requested",
  undetermined: "Undetermined",
  wild: "Wild",
  individual: "Individual",
  group: "Group",
  apply: "Apply",
  give: "Give",
  source: "Source",
  holder: "Holder",
  owner: "Owner",
  local: "Local",
  gan: "GAN",
  itis: "ITIS",
  gbif: "GBIF",
};

/** Spec tokens (camelCase) shown as words; source strings left as written. */
export function token(s: unknown): string {
  if (typeof s !== "string") return s === null || s === undefined ? "" : String(s);
  if (TOKENS[s]) return TOKENS[s];
  if (/^[a-z]+[A-Z][A-Za-z]*$/.test(s)) return label(s);
  return s;
}

function plural(n: number | string, one: string, many: string): string {
  return Number(n) === 1 ? one : many;
}

function list(xs: unknown): string {
  if (!Array.isArray(xs) || !xs.length) return "";
  if (xs.length === 1) return String(xs[0]);
  return xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
}

function times(n: unknown): string {
  const k = Number(n);
  if (k === 1) return "once";
  if (k === 2) return "twice";
  return `${n} times`;
}

/** A dose frequency or a diet meal schedule, as words. */
export function schedule(f: any): string {
  if (!f || typeof f !== "object") return f ? String(f) : "";
  const every = f.every ?? 1;
  const ev = (one: string, many: string) => (Number(every) === 1 ? `every ${one}` : `every ${every} ${many}`);
  let s: string;
  switch (f.pattern) {
    case "everyHours":
      s = ev("hour", "hours");
      break;
    case "everyDays":
      s = Number(every) === 1 ? "every day" : `every ${every} days`;
      break;
    case "everyWeeks":
      s = ev("week", "weeks") + (f.weekDays?.length ? ` on ${list(f.weekDays)}` : "");
      break;
    case "everyMonths":
      s = ev("month", "months");
      if (f.monthDay) s += ` on day ${f.monthDay}`;
      else if (f.monthWeek && f.weekDay) s += ` on the ${f.monthWeek} ${f.weekDay}`;
      break;
    case "timesPerDay":
      s = `${times(f.times)} a day`;
      break;
    case "timesPerWeek":
      s = Number(every) > 1 ? `${times(f.times)} every ${every} weeks` : `${times(f.times)} a week`;
      if (f.weekDays?.length) s += ` (${list(f.weekDays)})`;
      break;
    case "timesPerMonth":
      s = Number(every) > 1 ? `${times(f.times)} every ${every} months` : `${times(f.times)} a month`;
      break;
    case "fixedDates":
      s = f.dates?.length ? `on ${list(f.dates)}` : "on fixed dates";
      break;
    case "asNeeded":
      s = "as needed";
      break;
    case "singleDose":
      s = "as a single dose";
      break;
    case "notScheduled":
      s = "not scheduled";
      break;
    default: {
      // An unknown pattern: say what we were given rather than guess.
      const rest = Object.entries(f)
        .filter(([k]) => k !== "pattern" && k !== "timeOfDay" && k !== "firstDate")
        .map(([k, v]) => `${label(k).toLowerCase()} ${Array.isArray(v) ? v.join(", ") : v}`);
      s = [token(f.pattern ?? "schedule").toLowerCase(), ...rest].join(", ");
    }
  }
  if (f.timeOfDay) s += `, ${f.timeOfDay}`;
  if (f.firstDate && f.pattern !== "fixedDates") s += `, from ${f.firstDate}`;
  return s;
}

const DURATION_ONE: Record<string, string> = { days: "day", doses: "dose", weeks: "week", months: "month", hours: "hour" };

export function duration(d: any): string {
  if (!d || typeof d !== "object") return d ? String(d) : "";
  if (d.untilFurtherNotice) return "until further notice";
  if (d.value === undefined) return "";
  const u = String(d.unit ?? "");
  const word = Number(d.value) === 1 && DURATION_ONE[u] ? DURATION_ONE[u] : unit(u);
  return `for ${num(d.value)} ${word}`.trim();
}

/** "1.16 mL (5.82 mg) at 0.1 mg/kg": the amount alone, no verb or schedule. */
export function doseAmount(d: any): string {
  if (!d || typeof d !== "object") return "";
  let what = d.dose ? amount(d.dose) : "";
  if (d.drugAmount) what = what ? `${what} (${amount(d.drugAmount)})` : amount(d.drugAmount);
  if (d.doseRate) what += `${what ? " " : ""}at ${amount(d.doseRate)}`;
  return what;
}

/** "Give 1 tablet (100 mg) once a day, until further notice". */
export function doseText(d: any): string {
  if (!d || typeof d !== "object") return "";
  const parts: string[] = [];
  const verb = d.administration === "apply" ? "Apply" : d.administration === "give" ? "Give" : "";
  const what = doseAmount(d);
  const head = [verb, what].filter(Boolean).join(" ");
  if (head) parts.push(head);
  const freq = schedule(d.frequency);
  if (freq) parts.push(freq);
  let s = parts.join(" ");
  // "as a single dose, for 1 dose" says the same thing twice.
  const oneDose = d.frequency?.pattern === "singleDose" && Number(d.duration?.value) === 1 && d.duration?.unit === "doses";
  const dur = oneDose ? "" : duration(d.duration);
  if (dur) s += `${s ? ", " : ""}${dur}`;
  s = s.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Population "m.f.u" with a reminder of the order. */
export function population(p: unknown): string {
  return typeof p === "string" && /^\d+\.\d+\.\d+$/.test(p) ? `${p} (male.female.unknown)` : String(p ?? "");
}

export { plural };
