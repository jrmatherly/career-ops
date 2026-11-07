// The web's own readers for the files beside the tracker that PR-08's writers
// fill: data/application-meta.tsv, data/application-events.tsv,
// data/active-interviews.md, data/contacts.tsv, the follow-up pins in
// data/follow-ups.md and data/offers/<slug>/terms.md. Text in, plain data out,
// no fs: the web never imports root modules (lib/application-meta.mjs is the
// writer these mirror), and the page reads the files itself.

import { dayInstant, zonedInstant } from "../next-step.mjs";

const META_KEYS = ["lane", "tag", "closed_reason", "source", "closed_at"];

/** Sidecar data rows as cells, `cells[0]` a positive integer. Same rule as readSidecarRows. */
function sidecarRows(text) {
  const rows = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line || line[0] === "#") continue;
    const cells = line.split("\t");
    if (cells.length < 5 || !/^\d+$/.test(cells[0]) || Number(cells[0]) <= 0) continue;
    cells[0] = Number(cells[0]);
    cells[4] = cells[4].trimEnd();
    rows.push(cells);
  }
  return rows;
}

/**
 * Latest value per (num, key); `tag` collects every distinct value, as readMeta does.
 * @returns {Map<number, { lane?: string, tag?: string[], closed_reason?: string, source?: string, closed_at?: string }>}
 */
export function parseMeta(text) {
  const out = new Map();
  for (const [num, , key, value] of sidecarRows(text)) {
    if (!META_KEYS.includes(key)) continue;
    let rec = out.get(num);
    if (!rec) out.set(num, (rec = {}));
    if (key === "tag") rec.tag = [...new Set([...(rec.tag ?? []), value])];
    else rec[key] = value;
  }
  return out;
}

/** @returns {{ num: number, at: string, kind: string, text: string, source: string }[]} */
export function parseEvents(text) {
  return sidecarRows(text).map(([num, at, kind, body, source]) => ({ num, at, kind, text: body, source }));
}

const splitRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);
const TRACKER_REF_RE = /#\s*(\d+)\s+in\s+tracker/i;
// interview-round.mjs writes `YYYY-MM-DD HH:MM <IANA tz> (<n>m)`; older rows carry less.
const WHEN_RE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?(?:\s+([A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+|UTC))?(?:\s*\((\d+)\s*m\))?/;

/**
 * Rounds in the first table of data/active-interviews.md, keyed to the tracker
 * by the `#N in tracker` reference interview-round.mjs writes in Notes, the
 * same hard match tracker-sync-check.mjs uses. A row without one is skipped.
 * `at` is an ISO instant, or null when the cell has no readable date.
 */
export function parseActiveInterviews(md) {
  const lines = String(md ?? "").split(/\r?\n/);
  const start = lines.findIndex(isTableLine);
  if (start === -1) return [];
  const header = splitRow(lines[start]).map((h) => h.toLowerCase());
  const col = (cells, ...names) => {
    const i = header.findIndex((h) => names.includes(h));
    return i === -1 ? "" : (cells[i] ?? "");
  };
  const out = [];
  for (let i = start + 1; i < lines.length && isTableLine(lines[i]); i++) {
    const cells = splitRow(lines[i]);
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const notes = col(cells, "notes");
    const ref = notes.match(TRACKER_REF_RE);
    if (!ref) continue;
    const when = col(cells, "date/time", "date");
    const m = when.match(WHEN_RE);
    const at = m ? (m[2] ? zonedInstant(m[1], m[2].padStart(5, "0"), m[3] ?? "UTC") : dayInstant(m[1])) : null;
    out.push({
      num: Number(ref[1]),
      company: col(cells, "company"),
      role: col(cells, "role"),
      round: col(cells, "round"),
      when,
      at: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
      durationMinutes: m?.[4] ? Number(m[4]) : 60,
      interviewer: col(cells, "interviewer"),
      status: col(cells, "status"),
      notes,
    });
  }
  return out;
}

const CONTACT_COLUMNS = ["name", "company", "type", "title", "phone", "email", "linkedin", "tracker", "notes"];

/**
 * data/contacts.tsv rows; `tracker` is the row number, or null for `-`.
 * @returns {{ name: string, company: string, type: string, title: string, phone: string, email: string, linkedin: string, tracker: number | null, notes: string }[]}
 */
export function parseContacts(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const head = lines[0]?.startsWith("#") ? lines[0].replace(/^#\s*/, "").split("\t").map((h) => h.trim().toLowerCase()) : CONTACT_COLUMNS;
  const out = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) continue;
    const cells = line.split("\t");
    const rec = Object.fromEntries(CONTACT_COLUMNS.map((key) => [key, (cells[head.indexOf(key)] ?? "").trim()]));
    const ref = rec.tracker.match(/^#?(\d+)$/);
    out.push({ ...rec, tracker: ref ? Number(ref[1]) : null });
  }
  return out;
}

// followup-cadence.mjs grammar: OVERRIDE_RE for pins, table rows and bullets for logged follow-ups.
const PIN_RE = /^-\s+next\s+#(\d+)\s+(\d{4}-\d{2}-\d{2})(?:\s+\(set\s+(\d{4}-\d{2}-\d{2})\))?(?:\s*[—–-]\s*(.*))?\s*$/i;
const BULLET_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s+·\s+#(\d+)\s/;

/**
 * The live follow-up pin per tracker number. The last pin wins, and it lapses
 * once a follow-up is logged after the day it was set (resolveNextOverride).
 * @returns {Map<number, { date: string, setDate: string, note: string }>}
 */
export function parseFollowupPins(md) {
  const pins = new Map();
  const lastLogged = new Map();
  const logged = (num, date) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !(lastLogged.get(num) >= date)) lastLogged.set(num, date);
  };
  for (const line of String(md ?? "").split(/\r?\n/)) {
    const pin = line.match(PIN_RE);
    if (pin) {
      if (dayInstant(pin[2])) pins.set(Number(pin[1]), { date: pin[2], setDate: pin[3] || pin[2], note: (pin[4] ?? "").trim() });
      continue;
    }
    if (line.startsWith("|")) {
      const parts = line.split("|").map((s) => s.trim());
      if (parts.length >= 8 && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) logged(Number(parts[2]), parts[3]);
      continue;
    }
    const bullet = line.match(BULLET_RE);
    if (bullet) logged(Number(bullet[2]), bullet[1]);
  }
  for (const [num, pin] of pins) if ((lastLogged.get(num) ?? "") > pin.setDate) pins.delete(num);
  return pins;
}

/** One data/offers/<slug>/terms.md as offer-terms.mjs writes it, or null without a `Tracker: #N` line. */
export function parseOfferTerms(md) {
  const text = String(md ?? "");
  const num = text.match(/^Tracker:\s*#(\d+)\s*$/m);
  if (!num) return null;
  /** @type {Record<string, string>} */
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\| (.+?) \| (.*) \|$/);
    if (m && m[1] !== "Field" && !/^-+$/.test(m[1])) fields[m[1]] = m[2];
  }
  return { num: Number(num[1]), fields, respondBy: dayInstant(fields["Respond by"]) ? fields["Respond by"] : null };
}

/**
 * Rows grouped by tracker number in one pass, so joining 300 rows is a lookup
 * per source rather than a scan.
 * @template T
 * @param {readonly T[]} rows
 * @param {(row: T) => number | null} numOf
 * @returns {Map<number, T[]>}
 */
export function byNumber(rows, numOf) {
  const out = new Map();
  for (const row of rows) {
    const num = numOf(row);
    if (num === null) continue;
    if (!out.has(num)) out.set(num, []);
    out.get(num).push(row);
  }
  return out;
}

// A day-only entry sorts as noon, the instant dayInstant gives it.
const sortKey = (at) => (/^\d{4}-\d{2}-\d{2}$/.test(at) ? `${at}T12:00` : String(at ?? ""));

/**
 * Everything recorded about one tracker row, joined by its number.
 * `timeline` merges status changes, events and rounds, newest first.
 * @param {{ n: string }} app
 * @param {{ log: Map<number, { num: number, date: string, from: string, to: string, source: string, note: string }[]>, meta: ReturnType<typeof parseMeta>, events: Map<number, ReturnType<typeof parseEvents>>, interviews: Map<number, ReturnType<typeof parseActiveInterviews>>, contacts: Map<number, ReturnType<typeof parseContacts>>, pins: ReturnType<typeof parseFollowupPins>, offers: Map<number, NonNullable<ReturnType<typeof parseOfferTerms>>[]> }} sources each list grouped with byNumber
 */
export function joinApplication(app, sources) {
  const num = Number(app.n);
  const meta = sources.meta.get(num) ?? {};
  const log = sources.log.get(num) ?? [];
  const events = sources.events.get(num) ?? [];
  const interviews = sources.interviews.get(num) ?? [];
  const timeline = [
    ...log.map((r) => ({ at: r.date, kind: "status", text: `${r.from || "—"} → ${r.to}${r.note ? ` (${r.note})` : ""}`, source: r.source })),
    ...events.map((e) => ({ at: e.at, kind: e.kind, text: e.text, source: e.source })),
    ...interviews.map((r) => ({ at: r.at ?? r.when, kind: "interview", text: [r.round, r.interviewer, r.status].filter(Boolean).join(" · "), source: "" })),
  ].sort((a, b) => sortKey(b.at).localeCompare(sortKey(a.at)));
  return {
    num,
    lane: meta.lane ?? null,
    tags: meta.tag ?? [],
    closedReason: meta.closed_reason ?? null,
    log,
    events,
    interviews,
    contacts: sources.contacts.get(num) ?? [],
    followUp: sources.pins.get(num) ?? null,
    offer: sources.offers.get(num)?.at(-1) ?? null,
    timeline,
  };
}
