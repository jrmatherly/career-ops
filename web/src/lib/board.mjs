// The /board kanban: one column per stage tab of /pipeline, so a card sits in
// the column whose tab would list it. INBOX, ALL and OTHER are not stages.

import { PIPELINE_TABS, rowOnPipelineTab } from "./pipeline-navigation.mjs";

const NOT_STAGES = new Set(["INBOX", "ALL", "OTHER"]);

/** The ten stage tabs, in /pipeline's order. */
export const BOARD_COLUMNS = PIPELINE_TABS.filter((tab) => !NOT_STAGES.has(tab));

// The canonical label (templates/states.yml) a drop onto each column saves and
// the column shows. /api/status echoes exactly this, which saveStatus checks.
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

/** @param {string} tab */
export const columnStatus = (tab) => COLUMN_STATUS[tab] ?? null;

/** The column a status sits in, or null for a status no stage tab lists. */
export const columnOf = (status) => BOARD_COLUMNS.find((tab) => rowOnPipelineTab(status, tab)) ?? null;

/**
 * Rows grouped into the ten columns, each split into lane sub-groups when any
 * of its rows has a lane: named lanes in name order, then the unlaned rows.
 * Rows keep their input order inside a group.
 * @template {{ n: string, status: string }} T
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
    const lanes = [...named, ...(byLane.has(null) ? [null] : [])].map((lane) => ({ lane, rows: byLane.get(lane) }));
    return { tab, status: COLUMN_STATUS[tab], count: lanes.reduce((n, l) => n + l.rows.length, 0), lanes };
  });
}

/**
 * The card's one-line next step.
 * @param {import("./next-step.mjs").NextStep} step
 * @param {string} [timeZone]
 */
export function nextStepLabel(step, timeZone = "UTC") {
  const day = (at) => at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
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
      return step.overdue ? `Offer reply overdue · ${day(step.respondBy)}` : `Reply by ${day(step.respondBy)}`;
    case "not-applied":
      return "Not applied";
    default:
      return "Closed";
  }
}
