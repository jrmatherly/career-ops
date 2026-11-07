import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot, readApplications, readStatusLog, type Application } from "@/lib/career-ops";
import {
  byNumber,
  joinApplication,
  parseActiveInterviews,
  parseContacts,
  parseEvents,
  parseFollowupPins,
  parseMeta,
  parseOfferTerms,
} from "@/lib/core/application-sidecars.mjs";
import { daysInStage, nextStep } from "@/lib/next-step.mjs";
import { columnOf, nextStepLabel } from "@/lib/board.mjs";

export type ApplicationDetail = ReturnType<typeof joinApplication>;
export type BoardCard = Application & { stageDays: number | null; nextStep: string; nextKind: string; detail: ApplicationDetail };

// A missing sidecar is normal (nothing recorded yet). Any other read failure
// is rethrown: an unreadable file must not pass for an empty one.
function read(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function readOffers(dir: string) {
  let slugs: string[];
  try {
    slugs = fs.readdirSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return slugs.flatMap((slug) => {
    const terms = parseOfferTerms(read(path.join(dir, slug, "terms.md")));
    return terms ? [terms] : [];
  });
}

/** Every file the board joins, read once per request. */
export function readSources(root = careerOpsRoot()) {
  // PR-08's writers and the contacts and follow-up writers always use <root>/data;
  // only the status log sits beside the tracker, which readStatusLog follows.
  const data = path.join(root, "data");
  // interview-round.mjs writes the root-level file when only that one exists.
  const interviews = read(path.join(data, "active-interviews.md")) ?? read(path.join(root, "active-interviews.md"));
  const byNum = (row: { num: number }) => row.num;
  return {
    log: byNumber(readStatusLog(), byNum),
    meta: parseMeta(read(path.join(data, "application-meta.tsv"))),
    events: byNumber(parseEvents(read(path.join(data, "application-events.tsv"))), byNum),
    interviews: byNumber(parseActiveInterviews(interviews), byNum),
    contacts: byNumber(parseContacts(read(path.join(data, "contacts.tsv"))), (c) => c.tracker),
    pins: parseFollowupPins(read(path.join(data, "follow-ups.md"))),
    offers: byNumber(readOffers(path.join(data, "offers")), byNum),
  };
}

/** Tracker rows on a stage column, newest number first, each with its joined detail and next step. */
export function boardCards(now = new Date()): BoardCard[] {
  const sources = readSources();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return readApplications()
    .filter((app) => columnOf(app.status) !== null)
    .sort((a, b) => Number(b.n) - Number(a.n))
    .map((app) => {
      const detail = joinApplication(app, sources);
      const subject = { status: app.status, date: app.date, log: detail.log, followUp: detail.followUp, offer: detail.offer };
      const step = nextStep(subject, detail.events, detail.interviews, now, timeZone);
      return { ...app, stageDays: daysInStage(subject, now), nextStep: nextStepLabel(step, timeZone), nextKind: step.kind, detail };
    });
}
