// Ported from Reactive Resume packages/schema/src/applications/next-step.ts at
// clone SHA d065a9f7. MIT License, copyright (c) Amruth Pillai.
//
// What an application needs next, read from career-ops' own records: the
// tracker status and date, the status-log rows for its number, contact events
// from data/application-events.tsv, rounds from data/active-interviews.md, the
// follow-up pin and offer terms. The ledger's file order is its write order,
// so the last row into the current stage is the current visit.

import { statusToken } from "./pipeline-sankey.mjs";

const DAY_MS = 86_400_000;
const FOLLOW_UP_AFTER_DAYS = 10;

const CLOSED = new Set(["HIRED", "REJECTED", "DISCARDED", "SKIP"]);
// Waiting on the employer after applying or after a first reply (RR's "screening").
const AWAITING_REPLY = new Set(["APPLIED", "RESPONDED", "ASSESSMENT"]);
const STAGES = new Set(["EVALUATED", ...AWAITING_REPLY, "INTERVIEW", "OFFER", ...CLOSED]);

/**
 * @typedef {{ date: string, to: string, source?: string }} StageLogRow status-log rows for one number, in file order
 * @typedef {{ status: string, date: string, log?: readonly StageLogRow[], followUp?: { date: string, note?: string } | null, offer?: { respondBy: string | null } | null }} NextStepApp
 * @typedef {{ at: string, kind: string }} NextStepEvent
 * @typedef {{ at: string | Date | null, durationMinutes: number, status?: string }} NextStepInterview
 * @typedef {{ kind: "interview", at: Date }
 *   | { kind: "follow-up", at: Date, note: string, overdue: boolean }
 *   | { kind: "no-reply", days: number, after?: "interview" }
 *   | { kind: "waiting", days: number | null }
 *   | { kind: "interview-feedback", days: number | null }
 *   | { kind: "no-interview", days: number | null }
 *   | { kind: "offer", days: number | null, respondBy: Date | null, overdue: boolean, terms: boolean }
 *   | { kind: "not-applied" }
 *   | { kind: "closed" }} NextStep
 */

/** A whole day sits at noon UTC, RR's convention, so no timezone moves it to another day. */
export function dayInstant(date) {
  const day = String(date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const at = new Date(`${day}T12:00:00Z`);
  // Date rolls 2026-02-30 over to March; an impossible day is no date at all.
  return !Number.isNaN(at.getTime()) && at.toISOString().startsWith(day) ? at : null;
}

const offsetAt = (t, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(t)
      .map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - t;
};

/** The instant a wall-clock date and time names in an IANA zone. An unknown zone reads as UTC. */
export function zonedInstant(date, time, timeZone = "UTC") {
  const guess = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(guess)) return null;
  try {
    const first = guess - offsetAt(guess, timeZone);
    return new Date(guess - offsetAt(first, timeZone));
  } catch {
    return new Date(guess);
  }
}

const dayNumber = (t) => Math.floor(t / DAY_MS);

const daysBetween = (from, to) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));

/**
 * When the current visit to the row's stage began: the last status-log row
 * into that stage, else the tracker date. A backfill row's date is a guess, so
 * it yields null rather than an elapsed-time claim.
 * @param {NextStepApp} app
 * @returns {Date | null}
 */
export function stageSince(app) {
  const token = statusToken(app.status);
  const visit = (app.log ?? []).findLast((row) => statusToken(row.to) === token);
  if (visit) return visit.source === "backfill" ? null : dayInstant(visit.date);
  return dayInstant(app.date);
}

/** @param {NextStepApp} app @param {Date} now */
export function daysInStage(app, now = new Date()) {
  const since = stageSince(app);
  return since ? daysBetween(since, now) : null;
}

const followUpStep = (followUp, now, timeZone) => {
  const at = zonedInstant(followUp.date, "09:00", timeZone);
  return at && { kind: "follow-up", at, note: followUp.note ?? "", overdue: at.getTime() < now.getTime() };
};

const interviewEnd = (round) => new Date(round.at).getTime() + (round.durationMinutes || 0) * 60_000;

/**
 * @param {NextStepApp} app
 * @param {readonly NextStepEvent[]} events
 * @param {readonly NextStepInterview[]} interviews
 * @param {Date} [now]
 * @param {string} [timeZone] where a date-only follow-up pin falls due at 09:00
 * @returns {NextStep}
 */
export function nextStep(app, events, interviews, now = new Date(), timeZone = "UTC") {
  const token = statusToken(app.status);
  if (CLOSED.has(token)) return { kind: "closed" };
  if (token === "OFFER") {
    const offer = app.offer ?? null;
    if (!offer?.respondBy && app.followUp) {
      const step = followUpStep(app.followUp, now, timeZone);
      if (step) return step;
    }
    const respondBy = offer?.respondBy ? dayInstant(offer.respondBy) : null;
    return {
      kind: "offer",
      days: daysInStage(app, now),
      respondBy,
      overdue: respondBy !== null && respondBy.getTime() < now.getTime(),
      terms: offer !== null,
    };
  }

  const rounds = interviews.filter((r) => r.at && !Number.isNaN(new Date(r.at).getTime()) && !/cancel/i.test(r.status ?? ""));
  const upcoming = rounds
    .filter((r) => interviewEnd(r) >= now.getTime())
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())[0];
  if (upcoming) return { kind: "interview", at: new Date(upcoming.at) };

  if (app.followUp) {
    const step = followUpStep(app.followUp, now, timeZone);
    if (step) return step;
  }

  if (!STAGES.has(token) || token === "EVALUATED") return { kind: "not-applied" };

  const since = stageSince(app);
  const days = since ? daysBetween(since, now) : null;
  const visitSince = since?.getTime();
  // Contact the user made during this visit restarts the reply clock. A whole-day
  // stage date sits at noon, so same-day contact counts by day, not by instant.
  const contacted = events.reduce((latest, event) => {
    if (event.kind !== "contact") return latest;
    const at = new Date(event.at).getTime();
    if (Number.isNaN(at) || at > now.getTime()) return latest;
    if (visitSince !== undefined && dayNumber(at) < dayNumber(visitSince)) return latest;
    return Math.max(latest, at);
  }, -Infinity);
  const replySince = Number.isFinite(contacted) ? contacted : (visitSince ?? -Infinity);
  const quietDays = Number.isFinite(replySince) ? daysBetween(new Date(replySince), now) : null;
  if (AWAITING_REPLY.has(token) && quietDays !== null && quietDays >= FOLLOW_UP_AFTER_DAYS) {
    return { kind: "no-reply", days: quietDays };
  }
  if (token === "INTERVIEW") {
    // Rounds that ended during this visit, counted from when they ended. Same-day
    // rounds count by day, like contact: a whole-day stage date sits at noon.
    const ended = visitSince === undefined ? [] : rounds.map(interviewEnd).filter((end) => dayNumber(end) >= dayNumber(visitSince));
    if (ended.length === 0) return { kind: "no-interview", days };
    const quiet = daysBetween(new Date(Math.max(...ended, contacted)), now);
    return quiet >= FOLLOW_UP_AFTER_DAYS ? { kind: "no-reply", days: quiet, after: "interview" } : { kind: "interview-feedback", days };
  }
  return { kind: "waiting", days };
}
