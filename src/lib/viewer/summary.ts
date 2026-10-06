/**
 * The header card (who the animal is, who sent the file) and the day-one
 * summary (what a receiving vet or curator needs before reading the rest).
 */
import { Viewer, h, sortNewest, dateKeyOf, isActiveRx, titleFor } from "./render";
import {
  typeLabel, amount, rating, facility, dateTime, dayOf, token, schedule, doseText, doseAmount, num, unit, drug,
} from "./format";

function row(dl: HTMLElement, term: string, value: string | Node | null | undefined) {
  if (value === null || value === undefined || value === "") return;
  const div = h("div", "pv-field");
  div.appendChild(h("dt", null, term));
  const dd = h("dd");
  if (typeof value === "string") dd.textContent = value;
  else dd.appendChild(value);
  div.appendChild(dd);
  dl.appendChild(div);
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

export function buildHeader(v: Viewer): HTMLElement {
  const root = v.root;
  const m = root.manifest ?? {};
  const core = root.core ?? {};
  const records = v.records;
  const card = h("section", "pv-card pv-header");
  card.setAttribute("aria-label", "Animal and file");

  const ids: any[] = Array.isArray(records.identifiers) ? records.identifiers : [];
  const primary = ids.find((i) => i && i.primary === true);

  const top = h("div", "pv-header-top");
  const who = h("div", "pv-header-who");
  const tax = core.taxonomy ?? {};
  who.appendChild(h("p", "pv-eyebrow", [tax.common, core.animalType && token(core.animalType)].filter(Boolean).join(" · ") || "Animal"));
  const name = primary?.value ?? core.localId ?? core.gan ?? "Unnamed animal";
  const h2 = h("h2", "pv-animal-name", String(name));
  who.appendChild(h2);
  const sub: string[] = [];
  if (primary?.identifierType) sub.push(String(primary.identifierType));
  if (core.localId && core.localId !== name) sub.push(`Local ID ${core.localId}`);
  if (core.gan && core.gan !== name) sub.push(`GAN ${core.gan}`);
  if (sub.length) who.appendChild(h("p", "pv-animal-sub", sub.join(" · ")));
  if (primary?.originRef) {
    const p = h("p", "pv-small");
    p.appendChild(v.refLink(primary.originRef, "Primary identifier record"));
    who.appendChild(p);
  }
  top.appendChild(who);
  if (Array.isArray(primary?.media) && primary.media.length && v.findMedia(String(primary.media[0]))) {
    const photo = v.mediaList(primary.media.slice(0, 1));
    photo.classList.add("pv-header-photo");
    top.appendChild(photo);
  }
  card.appendChild(top);

  const grid = h("div", "pv-header-grid");

  const animal = h("dl", "pv-fields pv-fields-tight");
  if (tax.scientificName) {
    const sci = h("span");
    sci.appendChild(h("em", null, String(tax.scientificName)));
    if (tax.rank) sci.appendChild(h("span", "pv-muted", ` (${tax.rank})`));
    row(animal, "Scientific name", sci);
  }
  if (Array.isArray(tax.taxonIds) && tax.taxonIds.length) {
    row(animal, "Taxon IDs", tax.taxonIds.map((t: any) => `${token(t.scheme)} ${t.value}`).join(" · "));
  }
  row(animal, "Sex", core.currentSex);
  const b = core.birth ?? {};
  if (b.birthDate || b.birthDateEarliest || b.birthDateLatest) {
    let s = b.birthDate ?? "";
    const lo = b.birthDateEarliest, hi = b.birthDateLatest;
    if ((lo || hi) && !(lo === hi && lo === b.birthDate)) {
      if (lo && hi) s += ` (between ${lo} and ${hi})`;
      else if (lo) s += ` (not before ${lo})`;
      else s += ` (not after ${hi})`;
    }
    row(animal, "Born", s.trim());
  }
  row(animal, "Birth type", b.birthType);
  if (b.birthInstitution) row(animal, "Born at", facility(b.birthInstitution));
  row(animal, "Hybrid", b.hybrid);
  if (core.lifeCycle) {
    const lc = core.lifeCycle;
    let s = token(lc.current);
    if (lc.initial && lc.initial !== lc.current) s += ` (initially ${token(lc.initial).toLowerCase()})`;
    row(animal, "Life cycle", s);
  }
  if (core.population) row(animal, "Population", `${core.population} (male.female.unknown)`);
  const death = arr(records.transactions).find((e) => /^death$/i.test(String(e.transactionType?.category ?? e.transactionType?.description ?? "")));
  if (death) {
    const when = dayOf(death.recordDateTime) || "Death";
    row(animal, "Died", typeof death.originRef === "string" ? v.refLink(death.originRef, when) : when);
  }
  // Anything else the core carries, generically.
  const knownCore = new Set(["gan", "localId", "taxonomy", "currentSex", "birth", "animalType", "lifeCycle", "population"]);
  const knownBirth = new Set(["birthDate", "birthDateEarliest", "birthDateLatest", "birthType", "hybrid", "birthInstitution"]);
  const extra: any = {};
  for (const [k, val] of Object.entries(core)) if (!knownCore.has(k)) extra[k] = val;
  for (const [k, val] of Object.entries(b)) if (!knownBirth.has(k)) extra[`birth ${k}`] = val;
  if (tax.extensions) extra.extensions = tax.extensions;
  for (const [k, val] of Object.entries(tax)) {
    if (!["common", "scientificName", "rank", "taxonIds", "extensions"].includes(k)) extra[k] = val;
  }
  if (Object.keys(extra).length) {
    const more = v.fields(extra);
    for (const child of Array.from(more.children)) animal.appendChild(child);
  }
  const col1 = h("div");
  col1.appendChild(h("h3", "pv-mini-title", "Animal"));
  col1.appendChild(animal);
  grid.appendChild(col1);

  const file = h("dl", "pv-fields pv-fields-tight");
  if (m.holderFacility) row(file, "Holder", facility(m.holderFacility));
  if (m.ownerFacility) row(file, "Owner", facility(m.ownerFacility));
  row(file, "Exported", [m.exportedDateTime && dateTime(m.exportedDateTime), m.exportedBy && `by ${m.exportedBy}`].filter(Boolean).join(" "));
  if (m.originSoftware) row(file, "Software", [m.originSoftware.name, m.originSoftware.version].filter(Boolean).join(" "));
  row(file, "Spec version", m.specVersion);
  row(file, "Batch key", m.transferBatchKey);
  row(file, "File", `${v.pkg.fileName} (${v.pkg.kind === "zip" ? `zip, ${v.pkg.media.size} media file${v.pkg.media.size === 1 ? "" : "s"}` : "bare JSON, no media"})`);
  const knownM = new Set(["specVersion", "transferBatchKey", "exportedDateTime", "exportedBy", "originSoftware", "holderFacility", "ownerFacility", "contents"]);
  const extraM: any = {};
  for (const [k, val] of Object.entries(m)) if (!knownM.has(k)) extraM[k] = val;
  if (Object.keys(extraM).length) for (const child of Array.from(v.fields(extraM).children)) file.appendChild(child);
  const col2 = h("div");
  col2.appendChild(h("h3", "pv-mini-title", "This file"));
  col2.appendChild(file);
  grid.appendChild(col2);
  card.appendChild(grid);

  if (v.sections.length) {
    const c = h("div", "pv-contents");
    c.appendChild(h("h3", "pv-mini-title", "Contents"));
    const ul = h("ul", "pv-chips");
    for (const sec of v.sections) {
      const li = h("li");
      const a = h("a", "pv-chip");
      a.href = `#${sec.details.id}`;
      a.dataset.section = sec.type;
      a.appendChild(document.createTextNode(typeLabel(sec.type)));
      a.appendChild(h("span", "pv-chip-count", String(sec.recordCount)));
      if (!sec.recordCount) a.classList.add("pv-chip-empty");
      li.appendChild(a);
      ul.appendChild(li);
    }
    c.appendChild(ul);
    card.appendChild(c);
  }
  return card;
}

/* ------------------------------------------------------------------ */
/* Day one                                                             */
/* ------------------------------------------------------------------ */

interface Block {
  title: string;
  items: HTMLElement[];
  tone?: "alert";
}

function arr(x: any): any[] {
  return Array.isArray(x) ? x.filter((o) => o && typeof o === "object") : [];
}

function newest(list: any[]): any | null {
  return sortNewest(list)[0] ?? null;
}

export function buildDayOne(v: Viewer): HTMLElement {
  const r = v.records;
  const blocks: Block[] = [];

  const item = (ref: string | undefined, lines: (string | Node | null | undefined | false)[]): HTMLElement => {
    const li = h("li", "pv-d1-item");
    let first = true;
    for (const line of lines) {
      if (!line) continue;
      const p = h("p", first ? "pv-d1-main" : "pv-d1-sub");
      if (typeof line === "string") p.textContent = line;
      else p.appendChild(line);
      li.appendChild(p);
      first = false;
    }
    if (ref) {
      const a = v.refLink(ref, "View record");
      a.classList.add("pv-d1-link");
      li.appendChild(a);
    }
    return li;
  };

  // Open medical alerts.
  const alerts = arr(r.medicalAlerts).filter((a) => !a.closedDateTime);
  if (alerts.length) {
    blocks.push({
      title: "Medical alerts",
      tone: "alert",
      items: alerts.map((a) => item(a.originRef, [
        [a.alertLevel && `${a.alertLevel}:`, a.alertText].filter(Boolean).join(" "),
      ])),
    });
  }

  // Drug reactions.
  const reactions = arr(r.drugReactions);
  if (reactions.length) {
    blocks.push({
      title: "Drug reactions",
      tone: "alert",
      items: reactions.map((d) => item(d.originRef, [
        [drug(d.drug), d.reactionLevel && `(${d.reactionLevel})`].filter(Boolean).join(" "),
        d.comments,
      ])),
    });
  }

  // Active chronic conditions, with the latest review.
  const chronic = arr(r.chronicConditions).filter((c) => /^active$/i.test(String(c.status ?? "")));
  if (chronic.length) {
    blocks.push({
      title: "Chronic conditions",
      items: chronic.map((c) => {
        const rev = newest(arr(c.reviews));
        const revLine = rev
          ? `Last reviewed ${dayOf(rev.reviewDateTime)}` +
            (rev.rating ? `: ${rating(rev.rating)}` : "") +
            (rev.action ? `. ${rev.action}` : "")
          : "";
        return item(c.originRef, [c.condition, c.detailedDescription, revLine]);
      }),
    });
  }

  // Active prescriptions.
  const rx = sortNewest(arr(r.prescriptions)).filter(isActiveRx);
  if (rx.length) {
    blocks.push({
      title: "Active prescriptions",
      items: rx.map((p) => {
        const lines: (string | Node)[] = [];
        const uses = arr(p.drugUse);
        for (const u of uses) {
          lines.push(drug(u.drug) + (u.prescriptionType ? ` · ${u.prescriptionType}` : ""));
          for (const d of arr(u.doses)) {
            const t = doseText(d);
            if (t) lines.push(t);
          }
        }
        if (!uses.length) lines.push("Prescription");
        const ctx = [p.route && `Route: ${p.route}`, p.treatmentStartDate && `from ${p.treatmentStartDate}`,
          p.treatmentEndDate && `to ${p.treatmentEndDate}`, p.status && `status ${token(p.status).toLowerCase()}`]
          .filter(Boolean).join(", ");
        if (ctx) lines.push(ctx);
        if (p.instructions) lines.push(`Instructions: ${p.instructions}`);
        return item(p.originRef, lines);
      }),
    });
  }

  // Active contraception.
  const contra = arr(r.contraceptions).filter((c) => c.status === "active" || (!c.status && !c.removalDate));
  if (contra.length) {
    blocks.push({
      title: "Contraception",
      items: sortNewest(contra).map((c) => item(c.originRef, [
        [c.contraceptionType, c.permanent === true ? "(permanent)" : ""].filter(Boolean).join(" "),
        c.recordDate && `Since ${c.recordDate}`,
        c.comments,
      ])),
    });
  }

  // Latest weight against the newest weight range.
  const meas = r.measurements;
  const sets = arr(Array.isArray(meas) ? meas : meas?.records);
  const isWeight = (m: any) => /^weight$/i.test(String(m?.measureCode?.description ?? ""));
  let latest: { set: any; m: any } | null = null;
  for (const set of sortNewest(sets)) {
    const w = arr(set.measurements).find(isWeight);
    if (w) {
      latest = { set, m: w };
      break;
    }
  }
  if (latest) {
    const ranges = arr(meas?.ranges).filter(isWeight);
    const range = ranges.sort((a, b) => String(b.startDate ?? "").localeCompare(String(a.startDate ?? "")))[0];
    const lines: (string | Node)[] = [];
    const wv = parseFloat(latest.m.quantity?.value);
    lines.push(`${amount(latest.m.quantity)} on ${dayOf(dateKeyOf(latest.set))}${latest.m.estimated ? " (estimated)" : ""}`);
    if (range) {
      const ru = String(range.unit ?? "");
      const parts: string[] = [];
      if (range.goal) parts.push(`goal ${num(range.goal.low)}–${num(range.goal.high)}`);
      if (range.acceptable) parts.push(`acceptable ${num(range.acceptable.low)}–${num(range.acceptable.high)}`);
      lines.push(`Range from ${range.startDate ?? "?"}: ${parts.join(", ")} ${unit(ru)}`.trim());
      const same = ru.toLowerCase() === String(latest.m.quantity?.unit ?? "").toLowerCase();
      if (!same) lines.push("The weight and the range use different units, so they are not compared here.");
      else if (!isNaN(wv)) {
        const inside = (x: any) => x && !(parseFloat(x.low) > wv) && !(parseFloat(x.high) < wv);
        let verdict = "";
        if (range.goal && inside(range.goal)) verdict = "Within the goal range.";
        else if (range.acceptable && inside(range.acceptable)) verdict = range.goal ? "Outside the goal range, within the acceptable range." : "Within the acceptable range.";
        else if (range.acceptable || range.goal) verdict = "Outside the range.";
        if (verdict) {
          const s = h("strong", verdict.startsWith("Within the goal") || verdict === "Within the acceptable range." ? "pv-ok" : "pv-warn", verdict);
          lines.push(s);
        }
      }
    }
    blocks.push({ title: "Latest weight", items: [item(latest.set.originRef, lines)] });
  }

  // Most recent anesthesia.
  const an = newest(arr(r.anesthesias));
  if (an) {
    const lines: (string | Node)[] = [];
    lines.push([dateTime(an.recordDateTime), an.reason].filter(Boolean).join(" · ") || titleFor("anesthesias", an).title);
    const drugs: string[] = [];
    for (const a of arr(an.anesthetics)) {
      for (const u of arr(a.drugUse)) {
        const doses = arr(u.doses).map(doseAmount).filter(Boolean);
        let line = drug(u.drug) + (u.anestheticType ? ` (${u.anestheticType})` : "");
        const how = [doses.join("; "), a.injectionRoute].filter(Boolean).join(", ");
        if (how) line += `: ${how}`;
        drugs.push(line);
      }
    }
    if (drugs.length) {
      const ul = h("ul", "pv-list");
      for (const d of drugs) ul.appendChild(h("li", null, d));
      lines.push(ul);
    }
    const comps = arr(an.complications).map((c) => [c.complication, c.level && `(level ${c.level})`].filter(Boolean).join(" "));
    lines.push(comps.length ? `Complications: ${comps.join(", ")}` : "No complications recorded.");
    const ratings = [
      an.inductionRating && `induction ${rating(an.inductionRating)}`,
      an.recoveryRating && `recovery ${rating(an.recoveryRating)}`,
      an.overallRating && `overall ${rating(an.overallRating)}`,
    ].filter(Boolean);
    if (ratings.length) lines.push(`Ratings: ${ratings.join(", ")}`);
    if (an.summary) lines.push(String(an.summary));
    blocks.push({ title: "Most recent anesthesia", items: [item(an.originRef, lines)] });
  }

  // Open cases.
  const cases = sortNewest(arr(r.cases)).filter((c) => c.status === "open" || (!c.status && !c.closedDateTime));
  if (cases.length) {
    blocks.push({
      title: "Open cases",
      items: cases.map((c) => item(c.originRef, [
        titleFor("cases", c).title,
        c.openedDateTime && `Opened ${dayOf(c.openedDateTime)}${c.primaryVet ? `, ${c.primaryVet}` : ""}`,
        c.complaint,
      ])),
    });
  }

  // Current diet.
  const diets = sortNewest(arr(r.diets)).filter((d) => !d.endDate);
  if (diets.length) {
    blocks.push({
      title: diets.length > 1 ? "Current diets" : "Current diet",
      items: diets.map((d) => {
        const lines: (string | Node)[] = [String(d.name ?? "Diet")];
        const facts = [d.startDate && `since ${d.startDate}`, d.energyGoal && `energy goal ${amount(d.energyGoal)}`,
          d.fedIndividually === true && "fed individually"].filter(Boolean);
        if (facts.length) lines.push(facts.join(", ").replace(/^./, (c) => c.toUpperCase()));
        const meals = arr(d.meals);
        if (meals.length) {
          const ul = h("ul", "pv-list");
          for (const meal of meals) {
            const items = arr(meal.items).map((i) => `${i.feedItem ?? "item"} ${amount(i.quantity)}`.trim()).join(", ");
            ul.appendChild(h("li", null, `${meal.name ?? "Meal"} (${schedule(meal.schedule)}): ${items}`));
          }
          lines.push(ul);
        }
        return item(d.originRef, lines);
      }),
    });
  }

  // Most recent welfare assessment.
  const wa = newest(arr(r.welfareAssessments));
  if (wa) {
    blocks.push({
      title: "Latest welfare assessment",
      items: [item(wa.originRef, [
        [wa.protocol, wa.score !== undefined && wa.score !== null && `score ${num(wa.score)}`].filter(Boolean).join(", "),
        [wa.recordDateTime && dayOf(wa.recordDateTime), wa.calculationMethod && `calculation ${wa.calculationMethod}`].filter(Boolean).join(", "),
      ])],
    });
  }

  const sec = h("section", "pv-dayone");
  sec.setAttribute("aria-labelledby", "pv-dayone-title");
  const head = h("div", "pv-dayone-head");
  const title = h("h2", "pv-h2", "Day one summary");
  title.id = "pv-dayone-title";
  head.appendChild(title);
  head.appendChild(h("p", "pv-muted pv-small", "Pulled from the records below: open alerts, drug reactions, active conditions and treatments, the latest weight, the most recent anesthesia, open cases, the current diet and the latest welfare score. Check the full record before acting on it."));
  sec.appendChild(head);
  if (!blocks.length) {
    sec.appendChild(h("p", "pv-muted", "Nothing in this file for a day-one summary: no open alerts, drug reactions, active conditions or prescriptions, contraception, weights, anesthesia, open cases, current diet or welfare assessments."));
    return sec;
  }
  const grid = h("div", "pv-dayone-grid");
  for (const b of blocks) {
    const card = h("div", `pv-d1-card${b.tone === "alert" ? " pv-d1-alert" : ""}`);
    card.appendChild(h("h3", "pv-d1-title", b.title));
    const ul = h("ul", "pv-d1-list");
    for (const it of b.items) ul.appendChild(it);
    card.appendChild(ul);
    grid.appendChild(card);
  }
  sec.appendChild(grid);
  return sec;
}

