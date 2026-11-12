// The /board kanban: one column per stage tab of /pipeline, so a card sits in
// the column whose tab would list it. INBOX, ALL and OTHER are not stages.

import { PIPELINE_TABS, rowOnPipelineTab } from "./pipeline-navigation.mjs";
import { APPLY_LINE } from "./report-sections.mjs";

const NOT_STAGES = new Set(["INBOX", "ALL", "OTHER"]);

/** The ten stage tabs, in /pipeline's order. */
export const BOARD_COLUMNS = PIPELINE_TABS.filter((tab) => !NOT_STAGES.has(tab));

// The canonical label (templates/states.yml) a drop onto each column saves and
// the column shows. /api/status echoes exactly this, which saveStatus checks.
/** @type {Record<string, string>} */
const COLUMN_STATUS = {
  EVALUATED: "Evaluated",
  APPLIED: "Applied",
  RESPONDED: "Responded",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
  DISCARDED: "Discarded",
  SKIP: "SKIP",
};

/** @param {string} tab @returns {string | null} */
export const columnStatus = (tab) => COLUMN_STATUS[tab] ?? null;

/**
 * The column a status sits in, or null for a status no stage tab lists.
 * @param {string} status
 */
export const columnOf = (status) => BOARD_COLUMNS.find((tab) => rowOnPipelineTab(status, tab)) ?? null;

/**
 * Rows grouped into the ten columns, each split into lane sub-groups when any
 * of its rows has a lane: named lanes in name order, then the unlaned rows.
 * Inside a group rows sort by score, highest first, with unscored rows last
 * and input order kept on ties.
 * @template {{ n: string, status: string, score?: string }} T
 * @param {readonly T[]} rows
 * @param {ReadonlyMap<number, { lane?: string }>} meta
 * @returns {{ tab: string, status: string, count: number, lanes: { lane: string | null, rows: T[] }[] }[]}
 */
export function groupByColumn(rows, meta) {
  const byColumn = new Map(BOARD_COLUMNS.map((tab) => [tab, new Map()]));
  for (const row of rows) {
    const lanes = byColumn.get(columnOf(row.status));
    if (!lanes) continue;
    const lane = meta.get(Number(row.n))?.lane || null;
    if (!lanes.has(lane)) lanes.set(lane, []);
    lanes.get(lane).push(row);
  }
  return BOARD_COLUMNS.map((tab) => {
    const byLane = byColumn.get(tab);
    const named = [...byLane.keys()].filter((l) => l !== null).sort((a, b) => a.localeCompare(b));
    const lanes = [...named, ...(byLane.has(null) ? [null] : [])].map((lane) => ({ lane, rows: byLane.get(lane).sort(byScore) }));
    return { tab, status: COLUMN_STATUS[tab], count: lanes.reduce((n, l) => n + l.rows.length, 0), lanes };
  });
}

// A score cell ("4.0/5") as a number; -1 for an unscored row ("N/A", "—", blank).
// Not report-persist.mjs's scoreValue: that module pulls node:fs into the client bundle.
const scoreOf = (row) => {
  // The first number in the cell, as applyLineLabel reads it, so a bold "**4.5/5**" still counts.
  const n = Number(String(row.score ?? "").match(/(\d+(?:\.\d+)?)/)?.[1]);
  return Number.isFinite(n) ? n : -1;
};
// Array.prototype.sort is stable, so equal scores keep input order.
const byScore = (a, b) => scoreOf(b) - scoreOf(a);

/**
 * The Evaluated column's split at the same apply line Today and the report use:
 * rows at or above it, then the rest
 * (unscored rows included), each in input order.
 * @template {{ score?: string }} T
 * @param {readonly T[]} rows
 * @returns {{ above: T[], below: T[] }}
 */
export function splitAtApplyLine(rows, threshold = APPLY_LINE) {
  return {
    above: rows.filter((row) => scoreOf(row) >= threshold),
    below: rows.filter((row) => scoreOf(row) < threshold),
  };
}

/**
 * The card's one-line next step.
 * @param {import("./next-step.mjs").NextStep} step
 * @param {string} [timeZone]
 */
export function nextStepLabel(step, timeZone = "UTC") {
  const day = (at, zone = timeZone) => at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: zone });
  const waited = (days) => (days === null ? "" : ` · ${days}d`);
  switch (step.kind) {
    case "interview":
      return `Interview ${day(step.at)}`;
    case "follow-up":
      return step.overdue ? `Follow-up overdue · ${day(step.at)}` : `Follow up ${day(step.at)}`;
    case "no-reply":
      return `No reply${waited(step.days)}`;
    case "waiting":
      return `Waiting${waited(step.days)}`;
    case "interview-feedback":
      return "Awaiting feedback";
    case "no-interview":
      return "Schedule interview";
    case "offer":
      if (!step.respondBy) return "Decide on offer";
      // respondBy is a whole day at noon UTC (dayInstant); the viewer's zone would move it east of UTC+12.
      return step.overdue ? `Offer reply overdue · ${day(step.respondBy, "UTC")}` : `Reply by ${day(step.respondBy, "UTC")}`;
    case "not-applied":
      return "Not applied";
    default:
      return "Closed";
  }
}
