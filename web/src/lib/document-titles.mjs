/** The report number a tracker row links to, read from the report filename (`reports/042-fabrikam-….md`). */
function linkedReportNumber(report) {
  const m = /(?:^|[/(])0*(\d+)-[^/()]*\.md\b/.exec(String(report ?? ""));
  return m ? Number(m[1]) : null;
}

/**
 * A generated PDF's card title: the company and role of the tracker row whose
 * report it was made from, or the filename when no row links that report.
 * @param {{ filename: string, reportId: string | null }} doc
 * @param {{ n: string, company: string, role: string, report: string }[]} applications
 * @returns {{ title: string, subtitle: string, trackerN: string | null }}
 */
export function documentTitle(doc, applications) {
  const id = /^\d+$/.test(doc.reportId ?? "") ? Number(doc.reportId) : null;
  const row = id === null ? undefined : applications.find((app) => linkedReportNumber(app.report) === id);
  return row
    ? { title: row.company, subtitle: row.role, trackerN: row.n }
    : { title: doc.filename, subtitle: "", trackerN: null };
}
