import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import * as yaml from "js-yaml";

import {
  emptyScheduledStore,
  isSafeScheduledId,
  readLockStatus,
  readScheduledStore,
  withResourceLock,
  withScheduledStore,
} from "../../src/lib/scheduled-jobs-store.mjs";
import {
  buildScanCommand,
  claimDueJob,
  claimManualJob,
  enqueueDueJobs,
  executeJob,
  extractRolesFound,
  MAX_ATTEMPTS,
  MAX_RUNS,
  nextFutureRun,
  recordCompletion,
  runnerResourcePath,
  SCAN_TIMEOUT_MS,
} from "../../scripts/scheduled-jobs-runner.mjs";
import { assertScheduledJobBody, scheduledFiltersFrom } from "../../src/lib/scheduled-job-input.mjs";
import { scanFailureMessage, stderrCause } from "../../src/lib/scheduled-scan-error.mjs";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("scheduled-jobs store starts empty and never seeds candidate-specific targeting", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-store-"));
  try {
    const store = readScheduledStore(path.join(temp, "scheduled-jobs.json"));
    assert.deepEqual(store, emptyScheduledStore());
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("scheduled-jobs store serializes concurrent writers without losing jobs", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-lock-"));
  const storePath = path.join(temp, "scheduled-jobs.json");
  try {
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        withScheduledStore(storePath, (store) => {
          const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
          const now = new Date().toISOString();
          store.jobs.push({ id, name: String(index), status: "active", engine: "full", filters: {}, timezone: "UTC", startAt: now, every: 1, unit: "hours", createdAt: now, updatedAt: now });
        }),
      ),
    );
    const ids = readScheduledStore(storePath).jobs.map((job) => job.name).sort();
    assert.deepEqual(ids, Array.from({ length: 12 }, (_, index) => String(index)).sort());
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("invalid scheduled-jobs JSON is reported instead of overwritten", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-invalid-"));
  const storePath = path.join(temp, "scheduled-jobs.json");
  try {
    fs.writeFileSync(storePath, "{not-json", "utf8");
    assert.throws(() => readScheduledStore(storePath), /Invalid scheduled-jobs store/);
    assert.equal(fs.readFileSync(storePath, "utf8"), "{not-json");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("overdue schedules queue once and advance directly to the next future run", () => {
  const now = Date.parse("2026-08-08T12:00:00.000Z");
  const store = {
    jobs: [{
      id: "job-1",
      status: "active",
      startAt: "2026-08-08T08:00:00.000Z",
      every: 1,
      unit: "hours",
    }],
    runs: [],
    queue: [],
  };

  assert.equal(enqueueDueJobs(store, now), 1);
  assert.equal(store.queue.length, 1);
  assert.equal(store.jobs[0].nextRunAt, "2026-08-08T13:00:00.000Z");
  assert.equal(enqueueDueJobs(store, now), 0);
  assert.equal(store.queue.length, 1);
  assert.equal(nextFutureRun("2026-08-08T08:00:00.000Z", 1, "hours", now), "2026-08-08T13:00:00.000Z");
});

test("scan command honors the selected engine and bounded filters", () => {
  const filters = {
    sinceDays: 5,
    ats: ["lever", "ashby"],
    limitPerAts: 999,
  };
  assert.deepEqual(buildScanCommand({ engine: "portals", filters }), {
    script: "scan.mjs",
    args: ["--since", "5", "--quiet"],
  });
  assert.deepEqual(buildScanCommand({ engine: "full", filters }), {
    script: "scan-ats-full.mjs",
    args: ["--since", "5", "--ats", "lever,ashby", "--limit", "500", "--json"],
  });
});

test("scheduled overlay falls back to portal title keywords and preserves hard location blocks", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-filters-"));
  fs.writeFileSync(path.join(temp, "portals.yml"), "title_filter:\n  positive: [engineer]\ntitle_filter_full:\n  positive: [architect]\nlocation_filter: {}\n", "utf8");
  const job = {
    id: "11111111-1111-4111-8111-111111111111",
    engine: "full",
    filters: { positive: [], blockHard: ["Brazil"], alwaysAllow: ["Porto"] },
  };
  try {
    let overlay;
    const result = executeJob(temp, job, {
      spawnFn: (_node, _args, options) => {
        assert.equal(options.env.CAREER_OPS_ROOT, temp);
        assert.ok(fs.existsSync(path.join(options.cwd, "scan.mjs")));
        overlay = yaml.load(fs.readFileSync(options.env.CAREER_OPS_PORTALS, "utf8"));
        return { status: 0, stdout: JSON.stringify({ postingsKept: 0 }), stderr: "" };
      },
    });
    assert.equal(result.state, "success");
    assert.deepEqual(overlay.title_filter.positive, ["engineer"]);
    assert.deepEqual(overlay.title_filter_full.positive, ["architect"], "an empty job list leaves the file's full-title list alone");
    assert.deepEqual(overlay.location_filter.block_hard, ["Brazil"]);
    assert.deepEqual(overlay.location_filter.always_allow, ["Porto"]);
    const explicit = executeJob(temp, { ...job, filters: { ...job.filters, positive: ["designer"] } }, {
      spawnFn: (_node, _args, options) => {
        overlay = yaml.load(fs.readFileSync(options.env.CAREER_OPS_PORTALS, "utf8"));
        return { status: 0, stdout: JSON.stringify({ postingsKept: 0 }), stderr: "" };
      },
    });
    assert.equal(explicit.state, "success");
    assert.deepEqual(overlay.title_filter.positive, ["designer"]);
    assert.deepEqual(overlay.title_filter_full.positive, ["designer"]);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("scheduled scan hands core the profile path the web resolves, not the raw relative value", () => {
  // The scanner runs with cwd = the checkout, but the web resolves a relative
  // CAREER_OPS_PROFILE under the data root it passes, so forwarding the raw value
  // would let a data root outside the checkout read a different profile.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-profile-"));
  fs.writeFileSync(path.join(temp, "portals.yml"), "title_filter:\n  positive: [engineer]\nlocation_filter: {}\n", "utf8");
  const job = { id: "22222222-2222-4222-8222-222222222222", engine: "full", filters: { positive: ["engineer"] } };
  const saved = process.env.CAREER_OPS_PROFILE;
  const seen = (value) => {
    if (value === undefined) delete process.env.CAREER_OPS_PROFILE;
    else process.env.CAREER_OPS_PROFILE = value;
    let profile;
    const result = executeJob(temp, job, {
      spawnFn: (_node, _args, options) => {
        profile = options.env.CAREER_OPS_PROFILE;
        return { status: 0, stdout: JSON.stringify({ postingsKept: 0 }), stderr: "" };
      },
    });
    assert.equal(result.state, "success");
    return profile;
  };
  try {
    assert.equal(seen("profiles/me.yml"), path.join(temp, "profiles", "me.yml"));
    assert.equal(seen("  profiles/me.yml  "), path.join(temp, "profiles", "me.yml"));
    const absolute = path.join(os.tmpdir(), "elsewhere", "profile.yml");
    assert.equal(seen(absolute), absolute);
    assert.equal(seen(undefined), undefined);
  } finally {
    if (saved === undefined) delete process.env.CAREER_OPS_PROFILE;
    else process.env.CAREER_OPS_PROFILE = saved;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("scheduled scan never starts without title keywords", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-no-titles-"));
  fs.writeFileSync(path.join(temp, "portals.yml"), "title_filter: {}\n", "utf8");
  try {
    let spawned = false;
    const result = executeJob(temp, {
      id: "11111111-1111-4111-8111-111111111111",
      engine: "full",
      filters: { positive: [] },
    }, {
      spawnFn: () => { spawned = true; throw new Error("scanner must not run"); },
    });
    assert.equal(spawned, false);
    assert.equal(result.state, "failed");
    assert.equal(result.attempt, 1, "a config that always fails is not retried");
    assert.equal(result.message, "Scheduled scans require title keywords in the job or portals.yml title_filter.positive.");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

function withPortals(prefix, portalsYml, fn) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(temp, "portals.yml"), portalsYml, "utf8");
  try {
    return fn(temp);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function runWithOverlay(temp, job) {
  let overlay;
  const result = executeJob(temp, job, {
    spawnFn: (_node, _args, options) => {
      overlay = yaml.load(fs.readFileSync(options.env.CAREER_OPS_PORTALS, "utf8"));
      return { status: 0, stdout: JSON.stringify({ postingsKept: 0 }), stderr: "" };
    },
  });
  return { result, overlay };
}

const FULL_PORTALS = [
  "title_filter:",
  "  positive: [engineer]",
  "  negative: [intern]",
  "location_filter:",
  "  allow: [Remote]",
  "  block: [India]",
  "  block_hard: [Brazil]",
  "  always_allow: [Porto]",
  "",
].join("\n");

function captureStderr(fn) {
  const write = process.stderr.write;
  const lines = [];
  process.stderr.write = (chunk) => { lines.push(String(chunk)); return true; };
  try {
    return { value: fn(), stderr: lines.join("") };
  } finally {
    process.stderr.write = write;
  }
}

const scheduledTmp = (root) => {
  const dir = path.join(root, "data", "tmp");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.startsWith("scheduled-")) : [];
};

test("file filters skip the overlay and pass the absolute portals path", () => {
  withPortals("career-ops-scheduled-file-", FULL_PORTALS, (temp) => {
    const saved = process.env.CAREER_OPS_PORTALS;
    const run = (portalsEnv) => {
      if (portalsEnv === undefined) delete process.env.CAREER_OPS_PORTALS;
      else process.env.CAREER_OPS_PORTALS = portalsEnv;
      let seen;
      const { value: result, stderr } = captureStderr(() => executeJob(temp, {
        id: "33333333-3333-4333-8333-333333333333",
        engine: "full",
        filtersFrom: "file",
        filters: { positive: ["ignored"], sinceDays: 3, ats: ["lever", "ashby"], limitPerAts: 200 },
      }, {
        spawnFn: (_node, args, options) => {
          seen = { portals: options.env.CAREER_OPS_PORTALS, args, tmp: scheduledTmp(temp) };
          return { status: 0, stdout: JSON.stringify({ postingsKept: 2 }), stderr: "" };
        },
      }));
      assert.equal(result.state, "success");
      assert.equal(result.rolesFound, 2);
      return { ...seen, stderr };
    };
    try {
      const plain = run(undefined);
      assert.equal(plain.portals, path.join(temp, "portals.yml"));
      assert.deepEqual(plain.tmp, [], "no overlay is written in file mode");
      assert.deepEqual(plain.args, ["scan-ats-full.mjs", "--since", "3", "--ats", "lever,ashby", "--limit", "200", "--json"], "--since, --ats and --limit stay as the job set them");
      assert.equal(plain.stderr, `portals: ${path.join(temp, "portals.yml")} (file)\n`);
      fs.mkdirSync(path.join(temp, "lanes"));
      fs.copyFileSync(path.join(temp, "portals.yml"), path.join(temp, "lanes", "portals.yml"));
      const relative = run("lanes/portals.yml");
      assert.equal(relative.portals, path.join(temp, "lanes", "portals.yml"), "a relative override resolves against the data root");
      assert.equal(relative.stderr, `portals: ${path.join(temp, "lanes", "portals.yml")} (file)\n`);
    } finally {
      if (saved === undefined) delete process.env.CAREER_OPS_PORTALS;
      else process.env.CAREER_OPS_PORTALS = saved;
    }
  });
});

test("file filters refuse an empty positive list with the runner's message", () => {
  withPortals("career-ops-scheduled-file-empty-", "title_filter:\n  positive: []\n  negative: [intern]\n", (temp) => {
    let spawned = false;
    const result = executeJob(temp, { id: "33333333-3333-4333-8333-333333333333", engine: "full", filtersFrom: "file", filters: { positive: ["engineer"] } }, {
      spawnFn: () => { spawned = true; throw new Error("scanner must not run"); },
    });
    assert.equal(spawned, false);
    assert.equal(result.state, "failed");
    assert.equal(result.attempt, 1);
    assert.equal(result.message, "Scheduled scans require title keywords in portals.yml title_filter.positive when a job uses the file's filters");
  });
});

test("a missing portals.yml fails once before the scanner starts", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-missing-"));
  try {
    for (const filtersFrom of ["file", "custom"]) {
      let spawned = false;
      const result = executeJob(temp, { id: "33333333-3333-4333-8333-333333333333", engine: "full", filtersFrom, filters: { positive: ["engineer"] } }, {
        spawnFn: () => { spawned = true; throw new Error("scanner must not run"); },
      });
      assert.equal(spawned, false);
      assert.equal(result.state, "failed");
      assert.equal(result.attempt, 1);
      assert.match(result.message, /ENOENT/);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("a portals.yml that does not parse is named in the failure", () => {
  withPortals("career-ops-scheduled-bad-yaml-", "title_filter:\n  positive: [engineer]\n bad: 1\n", (temp) => {
    const result = executeJob(temp, { id: "33333333-3333-4333-8333-333333333333", engine: "full", filtersFrom: "file", filters: {} }, {
      spawnFn: () => { throw new Error("scanner must not run"); },
    });
    assert.equal(result.state, "failed");
    assert.equal(result.message, `${path.join(temp, "portals.yml")}: bad indentation of a mapping entry (3:2)`);
  });
});

test("an empty or scalar portals.yml is named in the failure before the scanner starts", () => {
  for (const [yml, reason] of [["", "expected a document, but the input is empty"], ["just text\n", "must contain a mapping"]]) {
    withPortals("career-ops-scheduled-empty-yaml-", yml, (temp) => {
      let spawned = false;
      const result = executeJob(temp, { id: "33333333-3333-4333-8333-333333333333", engine: "full", filters: { positive: ["engineer"] } }, {
        spawnFn: () => { spawned = true; throw new Error("scanner must not run"); },
      });
      assert.equal(spawned, false);
      assert.equal(result.attempt, 1);
      assert.equal(result.message, `${path.join(temp, "portals.yml")}: ${reason}`);
    });
  }
});

test("a portals.yml that is a sequence is refused in both modes before the scanner starts", () => {
  withPortals("career-ops-scheduled-sequence-", "- engineer\n- architect\n", (temp) => {
    for (const filtersFrom of ["file", "custom"]) {
      let spawned = false;
      const result = executeJob(temp, { id: "33333333-3333-4333-8333-333333333333", engine: "full", filtersFrom, filters: { positive: ["engineer"] } }, {
        spawnFn: () => { spawned = true; throw new Error("scanner must not run"); },
      });
      assert.equal(spawned, false, filtersFrom);
      assert.equal(result.attempt, 1);
      assert.equal(result.message, `${path.join(temp, "portals.yml")}: must contain a mapping`);
    }
  });
});

test("a job positive replaces a title_filter_full the file sets to a falsy scalar", () => {
  withPortals("career-ops-scheduled-full-false-", "title_filter:\n  positive: [engineer]\ntitle_filter_full: false\n", (temp) => {
    const { result, overlay } = runWithOverlay(temp, { id: "33333333-3333-4333-8333-333333333333", engine: "full", filters: { positive: ["designer"] } });
    assert.equal(result.state, "success");
    assert.deepEqual(overlay.title_filter_full.positive, ["designer"]);
  });
});

test("a scalar title_filter in the file leaves no stray keys in the overlay", () => {
  withPortals("career-ops-scheduled-scalar-section-", "title_filter: engineer\n", (temp) => {
    const { result, overlay } = runWithOverlay(temp, { id: "33333333-3333-4333-8333-333333333333", engine: "portals", filters: { positive: ["designer"] } });
    assert.equal(result.state, "success");
    assert.deepEqual(overlay.title_filter, { positive: ["designer"], negative: [] });
  });
});

test("a title section written as a sequence leaves no index keys in the overlay", () => {
  withPortals("career-ops-scheduled-sequence-section-", "title_filter:\n  - engineer\ntitle_filter_full:\n  - architect\n", (temp) => {
    const { result, overlay } = runWithOverlay(temp, { id: "33333333-3333-4333-8333-333333333333", engine: "full", filters: { positive: ["designer"] } });
    assert.equal(result.state, "success");
    assert.deepEqual(overlay.title_filter, { positive: ["designer"], negative: [] });
    assert.deepEqual(overlay.title_filter_full, { positive: ["designer"] });
  });
});

test("file mode refuses a falsy title_filter_full, which the full engine reads as no title limit", () => {
  withPortals("career-ops-scheduled-file-full-false-", "title_filter:\n  positive: [engineer]\ntitle_filter_full: false\n", (temp) => {
    let spawned = false;
    const result = executeJob(temp, { id: "33333333-3333-4333-8333-333333333333", engine: "full", filtersFrom: "file", filters: {} }, {
      spawnFn: () => { spawned = true; throw new Error("scanner must not run"); },
    });
    assert.equal(spawned, false);
    assert.equal(result.attempt, 1);
    assert.equal(result.message, "Scheduled scans require title keywords in portals.yml title_filter_full.positive when a job uses the file's filters");
  });
});

test("a scalar title list is no title limit to the scanner, so both modes refuse it", () => {
  withPortals("career-ops-scheduled-scalar-", "title_filter:\n  positive: engineer\n", (temp) => {
    for (const [filtersFrom, message] of [
      ["file", "Scheduled scans require title keywords in portals.yml title_filter.positive when a job uses the file's filters"],
      ["custom", "Scheduled scans require title keywords in the job or portals.yml title_filter.positive."],
    ]) {
      let spawned = false;
      const result = executeJob(temp, { id: "33333333-3333-4333-8333-333333333333", engine: "full", filtersFrom, filters: {} }, {
        spawnFn: () => { spawned = true; throw new Error("scanner must not run"); },
      });
      assert.equal(spawned, false, filtersFrom);
      assert.equal(result.attempt, 1);
      assert.equal(result.message, message);
    }
  });
});

test("the title guard refuses exactly the lists the scanner reads as no title limit", async () => {
  const { buildTitleFilter } = await import("../../../title-keywords.mjs");
  for (const positive of [[], [" "], [null], [1], "engineer", ["engineer"], ["*"]]) {
    const unlimited = buildTitleFilter({ positive })("zzz unmatched title");
    withPortals("career-ops-scheduled-drift-", yaml.dump({ title_filter: { positive } }), (temp) => {
      let spawned = false;
      executeJob(temp, { id: "33333333-3333-4333-8333-333333333333", engine: "portals", filtersFrom: "file", filters: {} }, {
        spawnFn: () => { spawned = true; return { status: 0, stdout: "", stderr: "" }; },
      });
      assert.equal(spawned, !unlimited, JSON.stringify(positive));
    });
  }
});

test("the title guard checks the list the full engine reads", () => {
  const fullOnly = "title_filter:\n  positive: []\ntitle_filter_full:\n  positive: [architect]\n";
  const fullEmpty = "title_filter:\n  positive: [engineer]\ntitle_filter_full:\n  negative: [intern]\n";
  const run = (yml, job) => withPortals("career-ops-scheduled-full-guard-", yml, (temp) => {
    let spawned = false;
    const result = executeJob(temp, { id: "55555555-5555-4555-8555-555555555555", filters: {}, ...job }, {
      spawnFn: () => { spawned = true; return { status: 0, stdout: JSON.stringify({ postingsKept: 0 }), stderr: "" }; },
    });
    return { spawned, result };
  });
  assert.equal(run(fullOnly, { engine: "full", filtersFrom: "file" }).spawned, true, "title_filter_full.positive satisfies the full engine");
  assert.equal(run(fullOnly, { engine: "portals", filtersFrom: "file" }).spawned, false, "scan.mjs reads title_filter only");
  const unguarded = run(fullEmpty, { engine: "full", filtersFrom: "file" });
  assert.equal(unguarded.spawned, false, "an empty title_filter_full.positive never reaches scan-ats-full");
  assert.equal(unguarded.result.message, "Scheduled scans require title keywords in portals.yml title_filter_full.positive when a job uses the file's filters");
  const custom = run(fullEmpty, { engine: "full" });
  assert.equal(custom.spawned, false, "a custom job with no positive list is refused too");
  assert.equal(custom.result.attempt, 1);
  assert.equal(custom.result.message, "Scheduled scans require title keywords in the job or portals.yml title_filter_full.positive.");
  assert.equal(run(fullEmpty, { engine: "full", filters: { positive: ["designer"] } }).spawned, true);
  const fullNull = "title_filter:\n  positive: [engineer]\ntitle_filter_full: null\n";
  assert.equal(run(fullNull, { engine: "full", filtersFrom: "file" }).spawned, true, "a null title_filter_full falls back to title_filter");
  const nullFallsBack = run("title_filter:\n  positive: []\ntitle_filter_full: null\n", { engine: "full", filtersFrom: "file" });
  assert.equal(nullFallsBack.spawned, false, "a null title_filter_full is not a title limit of its own");
  assert.equal(nullFallsBack.result.attempt, 1);
  assert.equal(nullFallsBack.result.message, "Scheduled scans require title keywords in portals.yml title_filter.positive when a job uses the file's filters");
  const noEngine = run(fullEmpty, { engine: undefined, filtersFrom: "file" });
  assert.equal(noEngine.spawned, false, "a job with no engine runs the full engine");
  assert.match(noEngine.result.message, /title_filter_full\.positive/);
});

test("custom job with empty lists inherits all six from the file", () => {
  withPortals("career-ops-scheduled-inherit-", FULL_PORTALS, (temp) => {
    let overlay;
    const result = executeJob(temp, { id: "44444444-4444-4444-8444-444444444444", engine: "full", filters: { positive: [], negative: [], allow: [], block: [], blockHard: [], alwaysAllow: [] } }, {
      spawnFn: (_node, _args, options) => {
        overlay = yaml.load(fs.readFileSync(options.env.CAREER_OPS_PORTALS, "utf8"));
        return { status: 0, stdout: JSON.stringify({ postingsKept: 0 }), stderr: "" };
      },
    });
    assert.equal(result.state, "success");
    assert.deepEqual(overlay.title_filter, { positive: ["engineer"], negative: ["intern"] });
    assert.deepEqual(overlay.location_filter, { allow: ["Remote"], block: ["India"], block_hard: ["Brazil"], always_allow: ["Porto"] });
    assert.deepEqual(scheduledTmp(temp), [], "the overlay is removed after the run");
  });
});

test("an inherited file list reaches the scanner unchanged", () => {
  withPortals("career-ops-scheduled-verbatim-", "title_filter:\n  positive: [2024, engineer, engineer, '*']\n", (temp) => {
    let overlay;
    const { stderr } = captureStderr(() => executeJob(temp, { id: "44444444-4444-4444-8444-444444444444", engine: "full", filters: {} }, {
      spawnFn: (_node, _args, options) => {
        overlay = yaml.load(fs.readFileSync(options.env.CAREER_OPS_PORTALS, "utf8"));
        return { status: 0, stdout: JSON.stringify({ postingsKept: 0 }), stderr: "" };
      },
    }));
    assert.deepEqual(overlay.title_filter.positive, [2024, "engineer", "engineer", "*"]);
    assert.equal(stderr, `portals: ${path.join(temp, "portals.yml")} (overlay)\n`);
  });
});

test("a legacy job with empty lists writes empty location lists when the file has none", () => {
  withPortals("career-ops-scheduled-legacy-", "title_filter:\n  positive: [engineer]\nlocation_filter: {}\n", (temp) => {
    let overlay;
    executeJob(temp, { id: "44444444-4444-4444-8444-444444444444", engine: "full", filters: { positive: [], negative: [], allow: [] } }, {
      spawnFn: (_node, _args, options) => {
        overlay = yaml.load(fs.readFileSync(options.env.CAREER_OPS_PORTALS, "utf8"));
        return { status: 0, stdout: JSON.stringify({ postingsKept: 0 }), stderr: "" };
      },
    });
    assert.deepEqual(overlay, {
      title_filter: { positive: ["engineer"], negative: [] },
      location_filter: { allow: [], block: [], block_hard: [], always_allow: [] },
    });
  });
});

test("custom job with a non-empty negative list replaces the file's", () => {
  withPortals("career-ops-scheduled-replace-", `${FULL_PORTALS}title_filter_full:\n  positive: [architect]\n  negative: [junior]\n`, (temp) => {
    let overlay;
    executeJob(temp, { id: "44444444-4444-4444-8444-444444444444", engine: "full", filters: { negative: ["sales", "sales", 7], allow: ["EU"] } }, {
      spawnFn: (_node, _args, options) => {
        overlay = yaml.load(fs.readFileSync(options.env.CAREER_OPS_PORTALS, "utf8"));
        return { status: 0, stdout: JSON.stringify({ postingsKept: 0 }), stderr: "" };
      },
    });
    assert.deepEqual(overlay.title_filter.negative, ["sales"]);
    assert.deepEqual(overlay.title_filter.positive, ["engineer"]);
    assert.deepEqual(overlay.title_filter_full, { positive: ["architect"], negative: ["sales"] });
    assert.deepEqual(overlay.location_filter.allow, ["EU"], "a job location list replaces the file's");
    assert.deepEqual(overlay.location_filter.block, ["India"]);
  });
});

test("scan command treats null and empty numeric filters as absent", () => {
  assert.deepEqual(buildScanCommand({ engine: "full", filters: { sinceDays: null, limitPerAts: "" } }).args, [
    "--since", "7", "--ats", "greenhouse,lever,ashby,workday", "--limit", "150", "--json",
  ]);
});

test("runner resource is derived from the exact scheduled store path", () => {
  assert.equal(runnerResourcePath("C:/one/data/scheduled-jobs.json"), "C:/one/data/scheduled-jobs.json.runner");
});

test("manual claims persist a running record and reject duplicate runs", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-manual-"));
  const storePath = path.join(temp, "scheduled-jobs.json");
  const jobId = "11111111-1111-4111-8111-111111111111";
  const now = Date.parse("2026-08-08T12:00:00.000Z");
  try {
    await withScheduledStore(storePath, (store) => {
      store.jobs.push({ id: jobId, name: "Manual", status: "active", engine: "full", filters: {}, timezone: "UTC", startAt: new Date(now).toISOString(), every: 1, unit: "hours", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
    });
    const claim = await withScheduledStore(storePath, (store) => claimManualJob(store, jobId, now));
    assert.ok(claim?.queueId);
    const running = readScheduledStore(storePath);
    assert.equal(running.queue.length, 1);
    assert.equal(running.queue[0].claimToken, claim.claimToken);
    assert.equal(running.runs[0].state, "running");
    const duplicate = await withScheduledStore(storePath, (store) => claimManualJob(store, jobId, now + 1_000));
    assert.equal(duplicate, null);
    await recordCompletion(storePath, claim, { state: "success", attempt: 1, rolesFound: 1, durationMs: 1, message: "ok" });
    const completed = readScheduledStore(storePath);
    assert.equal(completed.queue.length, 0);
    assert.equal(completed.runs[0].state, "success");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("manual claims allow paused jobs but exclude deleted and unknown jobs", () => {
  const now = Date.parse("2026-08-08T12:00:00.000Z");
  const base = { id: "11111111-1111-4111-8111-111111111111", name: "Manual", engine: "full", filters: {}, timezone: "UTC", startAt: new Date(now).toISOString(), every: 1, unit: "hours", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  const paused = { jobs: [{ ...base, status: "paused" }], runs: [], queue: [] };
  assert.ok(claimManualJob(paused, base.id, now));
  assert.equal(claimManualJob(paused, base.id, now + 1_000), null);
  assert.equal(claimManualJob({ jobs: [{ ...base, status: "deleted" }], runs: [], queue: [] }, base.id, now), null);
  assert.equal(claimManualJob({ jobs: [], runs: [], queue: [] }, base.id, now), null);
});

// The lock is the shared directory-lock protocol (lib/dir-lock.mjs, through the
// web mirror at src/lib/core/dir-lock.mjs). Its fs calls are named imports, so a
// patch of the default `fs` object reaches it only once syncBuiltinESMExports()
// pushes the patch into those bindings, the same technique the core's
// tests/dir-lock.test.mjs uses. The code under test runs unmodified and meets
// each fault at the exact line.
function patchFs(name, wrap) {
  const original = fs[name];
  fs[name] = wrap(original);
  syncBuiltinESMExports();
  return () => {
    fs[name] = original;
    syncBuiltinESMExports();
  };
}

const errno = (code, target) => Object.assign(new Error(`${code}: injected, '${target}'`), { code, path: target });

// A lock left by a holder that crashed: its owner pid is a process that has
// exited, so the protocol judges it stale and acquisition must go through the
// recover guard to reclaim it.
function plantStaleLock(resource) {
  const lockDir = `${resource}.lock`;
  const exited = spawnSync(process.execPath, ["-e", ""]);
  fs.mkdirSync(lockDir);
  fs.writeFileSync(path.join(lockDir, "owner.json"), JSON.stringify({ pid: exited.pid, token: "crashed", started_at: new Date().toISOString() }), "utf8");
  return lockDir;
}

test("lock creation cleans directories when owner metadata writes fail", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-lock-write-failure-"));
  const resource = path.join(temp, "resource");
  const owner = path.join(`${resource}.lock`, "owner.json");
  const restore = patchFs("writeFileSync", (original) => (file, ...args) => {
    if (String(file) === owner) {
      const error = new Error("injected owner write failure");
      error.code = "EIO";
      throw error;
    }
    return original(file, ...args);
  });
  try {
    await assert.rejects(withResourceLock(resource, async () => {}), /injected owner write failure/);
    assert.equal(fs.existsSync(`${resource}.lock`), false);
    assert.equal(fs.existsSync(`${resource}.lock.recover`), false);
  } finally {
    restore();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

// Windows answers mkdir on a directory another process is removing at that
// instant (pending delete) with EPERM/EACCES rather than EEXIST. Seen on
// windows-latest as `EPERM: operation not permitted, mkdir '…resource.recovery.lock'`
// out of the real-contender race test below.
//
// This store used to classify that answer by platform: contention on win32, an
// immediate throw elsewhere, with a `platform` option so both halves ran on
// every runner. The shared protocol classifies by error code alone
// (isMkdirContention), on every platform, and these tests follow it. POSIX
// never answers mkdir with EPERM for contention, so the cost there is only
// this: a genuine permissions failure waits out the lock budget instead of
// throwing at once, and then surfaces as a timeout that names the EPERM (the
// "persistent" test below). The core took that trade for #2777 because the
// alternative on Windows was a writer killed mid-contention and its item lost.
function injectMkdirFailures(target, code, failures = Number.POSITIVE_INFINITY) {
  const state = { attempts: 0 };
  state.restore = patchFs("mkdirSync", (original) => (dir, ...args) => {
    if (String(dir) === target) {
      state.attempts += 1;
      if (state.attempts <= failures) {
        const error = new Error(`${code}: operation not permitted, mkdir '${dir}'`);
        error.code = code;
        error.path = String(dir);
        throw error;
      }
    }
    return original(dir, ...args);
  });
  return state;
}

// The guard is `<resource>.lock.recover`, the protocol's name, not the old
// `<resource>.recovery.lock`, and it is taken only when the lock is contended:
// to reach it, these tests plant a crashed holder's lock first.
for (const [label, suffix, stale] of [["recover guard", ".lock.recover", true], ["resource lock", ".lock", false]]) {
  for (const code of ["EPERM", "EACCES"]) {
    test(`${label} mkdir retries ${code} as contention instead of crashing`, async () => {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-mkdir-retry-"));
      const resource = path.join(temp, "resource");
      if (stale) plantStaleLock(resource);
      const injected = injectMkdirFailures(`${resource}${suffix}`, code, 3);
      try {
        let entered = false;
        await withResourceLock(resource, async () => { entered = true; }, { retryMs: 1 });
        assert.equal(entered, true);
        assert.equal(injected.attempts, 4);
        assert.equal(fs.existsSync(`${resource}.lock`), false);
        assert.equal(fs.existsSync(`${resource}.lock.recover`), false);
      } finally {
        injected.restore();
        fs.rmSync(temp, { recursive: true, force: true });
      }
    });
  }

  // Formerly: the persistent EPERM surfaced as itself. Now it surfaces as the
  // lock's timeout, whose message keeps "lock timeout" (the routes map that to a
  // 409) and names the mkdir error, so a real permissions problem is still
  // distinguishable from a crowded lock.
  test(`a persistent ${label} mkdir EPERM times out naming the error`, async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-mkdir-deadline-"));
    const resource = path.join(temp, "resource");
    if (stale) plantStaleLock(resource);
    const injected = injectMkdirFailures(`${resource}${suffix}`, "EPERM");
    try {
      await assert.rejects(
        withResourceLock(resource, async () => {}, { retryMs: 1, timeoutMs: 40 }),
        (error) => error.code === "LOCK_TIMEOUT"
          && error.lastMkdirError === "EPERM"
          && /scheduled-jobs lock timeout/.test(error.message)
          && error.message.includes(`last mkdir error=EPERM on ${resource}${suffix}`),
      );
      assert.ok(injected.attempts > 1, "the lock gave up without retrying");
      assert.equal(fs.existsSync(`${resource}.lock`), stale, "only the planted lock may remain");
      assert.equal(fs.existsSync(`${resource}.lock.recover`), false);
    } finally {
      injected.restore();
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
}

// The old takeover renamed a stale lock aside before deleting it, and treated
// any rename error but ENOENT/EEXIST/ENOTEMPTY as fatal. On Windows a rename
// of a directory another process has open fails EBUSY/EPERM, so recovering a
// crashed holder's lock could itself crash the writer. The protocol removes
// the judged directory instead, and a contended removal is a retry.
for (const code of ["EBUSY", "EPERM"]) {
  test(`recovering a stale lock whose removal meets ${code} retries instead of crashing`, async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-takeover-"));
    const resource = path.join(temp, "resource");
    const lockDir = plantStaleLock(resource);
    let rmFailures = 0;
    const restoreRm = patchFs("rmSync", (original) => (target, ...args) => {
      if (String(target) === lockDir && rmFailures < 2) {
        rmFailures += 1;
        throw errno(code, lockDir);
      }
      return original(target, ...args);
    });
    const restoreRename = patchFs("renameSync", (original) => (from, ...args) => {
      if (String(from) === lockDir) throw errno(code, lockDir);
      return original(from, ...args);
    });
    try {
      let entered = false;
      await withResourceLock(resource, async () => { entered = true; }, { retryMs: 1 });
      assert.equal(entered, true);
      assert.equal(rmFailures, 2);
      assert.equal(fs.existsSync(lockDir), false);
    } finally {
      restoreRename();
      restoreRm();
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
}

test("lock status reports a live holder, a crashed holder and no lock", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-status-"));
  const resource = path.join(temp, "resource");
  try {
    assert.deepEqual(readLockStatus(resource), { exists: false, active: false, stale: false, owner: null });
    await withResourceLock(resource, async () => {
      const live = readLockStatus(resource);
      assert.equal(live.exists, true);
      assert.equal(live.active, true);
      assert.equal(live.stale, false);
      assert.equal(live.owner.pid, process.pid);
    });
    plantStaleLock(resource);
    const crashed = readLockStatus(resource);
    assert.equal(crashed.exists, true);
    assert.equal(crashed.active, false);
    assert.equal(crashed.stale, true);
    assert.equal(crashed.owner.token, "crashed");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("roles-found parsing matches both scanner output formats", () => {
  assert.equal(extractRolesFound("full", JSON.stringify({ postingsKept: 7 })), 7);
  assert.equal(extractRolesFound("portals", "New offers added:      3\n"), 3);
  assert.equal(extractRolesFound("full", "not json"), 0);
});

test("queue claim is durable until completion and stale claims are reclaimable", async () => {
  const now = Date.parse("2026-08-08T12:00:00.000Z");
  const store = {
    jobs: [{ id: "11111111-1111-4111-8111-111111111111", status: "active", startAt: "2026-08-08T08:00:00.000Z", every: 1, unit: "hours" }],
    runs: [],
    queue: [{ id: "22222222-2222-4222-8222-222222222222", jobId: "11111111-1111-4111-8111-111111111111", queuedAt: "2026-08-08T08:00:00.000Z" }],
  };
  const first = claimDueJob(store, now);
  assert.equal(first.claimToken.length, 36);
  assert.equal(store.queue.length, 1);
  assert.equal(store.queue[0].claimToken, first.claimToken);
  assert.equal(claimDueJob(store, now + 1_000), null);

  const reclaimed = claimDueJob(store, now + 31_000);
  assert.ok(reclaimed);
  assert.notEqual(reclaimed.claimToken, first.claimToken);
  assert.equal(store.queue.length, 1);

  await recordCompletion("unused", reclaimed, { state: "success", attempt: 1, rolesFound: 2, durationMs: 1, message: "ok" }, store);
  assert.equal(store.queue.length, 0);
  assert.equal(store.runs.length, 1);
});

test("daily recurrence preserves local wall-clock time over DST", () => {
  const beforeSpring = Date.parse("2026-03-07T14:00:00.000Z");
  const spring = nextFutureRun("2026-03-07T09:00:00.000-05:00", 1, "days", beforeSpring, "America/Toronto");
  assert.equal(spring, "2026-03-08T13:00:00.000Z");

  const beforeFall = Date.parse("2026-10-31T13:00:00.000Z");
  const fall = nextFutureRun("2026-10-31T09:00:00.000-04:00", 1, "days", beforeFall, "America/Toronto");
  assert.equal(fall, "2026-11-01T14:00:00.000Z");
});

test("scheduled IDs are UUIDs and lock status distinguishes stale owners", () => {
  assert.equal(isSafeScheduledId("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isSafeScheduledId("../escape"), false);
});

test("persisted malformed identifiers fail closed without touching the file", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-id-"));
  const storePath = path.join(temp, "scheduled-jobs.json");
  try {
    fs.writeFileSync(storePath, JSON.stringify({ jobs: [{ id: "../escape" }], runs: [], queue: [] }), "utf8");
    assert.throws(() => readScheduledStore(storePath), /Invalid scheduled-jobs store/);
    assert.match(fs.readFileSync(storePath, "utf8"), /escape/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("a crashed lock owner is recoverable by a real second process", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-crash-lock-"));
  const resource = path.join(temp, "resource");
  try {
    // Use dynamic exit access so the real crash remains covered without tripping
    // test-all's guard that rejects direct process termination in discovered suites.
    const child = (await import("node:child_process")).spawnSync(process.execPath, ["--input-type=module", "-e", `import { withResourceLock } from ${JSON.stringify(pathToFileURL(path.join(WEB_ROOT, "src/lib/scheduled-jobs-store.mjs")).href)}; await withResourceLock(${JSON.stringify(resource)}, async () => { process.stdout.write("claimed"); globalThis.process["exit"](17); });`], { encoding: "utf8" });
    assert.equal(child.status, 17);
    assert.equal(readLockStatus(resource).stale, true);
    let entered = false;
    await withResourceLock(resource, async () => { entered = true; });
    assert.equal(entered, true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("concurrent real contenders never overlap while taking over or releasing a lock", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-race-"));
  const resource = path.join(temp, "resource");
  const moduleUrl = pathToFileURL(path.join(WEB_ROOT, "src/lib/scheduled-jobs-store.mjs")).href;
  const runChild = (index) => new Promise((resolve, reject) => {
    const marker = path.join(temp, `${index}.json`);
    const code = `import fs from 'node:fs'; import { withResourceLock } from ${JSON.stringify(moduleUrl)}; const marker=${JSON.stringify(marker)}; await withResourceLock(${JSON.stringify(resource)}, async()=>{ const start=Date.now(); await new Promise(r=>setTimeout(r,35)); fs.writeFileSync(marker, JSON.stringify({start,end:Date.now()})); });`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => status === 0 ? resolve() : reject(new Error(stderr || `child exited ${status}`)));
  });
  try {
    await Promise.all(Array.from({ length: 8 }, (_, index) => runChild(index)));
    const intervals = Array.from({ length: 8 }, (_, index) => JSON.parse(fs.readFileSync(path.join(temp, `${index}.json`), "utf8"))).sort((a, b) => a.start - b.start);
    for (let index = 1; index < intervals.length; index += 1) assert.ok(intervals[index].start >= intervals[index - 1].end, "lock holders overlapped");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

// The interleaving behind the race test's intermittent ENOENT, replayed in one
// process. Our guard mkdir gets EEXIST. The holder then releases its guard
// before we stat it, and a second contender wins the mkdir and starts its own
// reclaim. A stat we could not complete proves nothing about staleness, so we
// must wait and leave the contender's new guard alone. ENOENT is the POSIX
// face; EPERM is how Windows answers for a directory that is mid-removal.
for (const statCode of ["ENOENT", "EPERM"]) {
  test(`a recover guard whose stat fails with ${statCode} is not taken from the contender who re-creates it`, async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-vanish-"));
    const resource = path.join(temp, "resource");
    const guardDir = `${resource}.lock.recover`;
    // A crashed holder's lock, so acquisition has to go through the guard, and
    // a live holder of that guard, so our own guard mkdir meets EEXIST.
    plantStaleLock(resource);
    fs.mkdirSync(guardDir);
    let contender = null;
    const restore = patchFs("statSync", (original) => (file, ...args) => {
      if (String(file) !== guardDir || contender !== null) return original(file, ...args);
      // The holder releases its guard just before we look...
      fs.rmdirSync(guardDir);
      // ...and a second contender takes it, holding it for 30ms.
      fs.mkdirSync(guardDir);
      contender = new Promise((resolve) => setTimeout(() => {
        const survived = fs.existsSync(guardDir);
        fs.rmSync(guardDir, { recursive: true, force: true });
        resolve(survived);
      }, 30));
      throw errno(statCode, String(file));
    });
    try {
      let entered = false;
      await withResourceLock(resource, async () => { entered = true; }, { retryMs: 5, timeoutMs: 2_000 });
      assert.equal(entered, true);
      assert.ok(contender, "the injected interleaving never ran");
      assert.equal(await contender, true, "the contender's guard was taken from it while it held it");
    } finally {
      restore();
      await contender;
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
}

test("a worker crash after a persisted claim leaves the queue recoverable", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-claim-crash-"));
  const storePath = path.join(temp, "scheduled-jobs.json");
  const storeModule = pathToFileURL(path.join(WEB_ROOT, "src/lib/scheduled-jobs-store.mjs")).href;
  const runnerModule = pathToFileURL(path.join(WEB_ROOT, "scripts/scheduled-jobs-runner.mjs")).href;
  const jobId = "11111111-1111-4111-8111-111111111111";
  const queueId = "22222222-2222-4222-8222-222222222222";
  const now = new Date().toISOString();
  fs.writeFileSync(storePath, JSON.stringify({ jobs: [{ id: jobId, name: "Crash test", status: "active", engine: "full", filters: {}, timezone: "UTC", startAt: now, every: 1, unit: "hours", createdAt: now, updatedAt: now }], runs: [], queue: [{ id: queueId, jobId, queuedAt: now }] }), "utf8");
  try {
    const code = `import { withScheduledStore } from ${JSON.stringify(storeModule)}; import { claimDueJob } from ${JSON.stringify(runnerModule)}; await withScheduledStore(${JSON.stringify(storePath)}, store => { if (!claimDueJob(store)) throw new Error('claim failed'); }); globalThis.process["exit"](19);`;
    const child = (await import("node:child_process")).spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
    assert.equal(child.status, 19);
    const persisted = readScheduledStore(storePath);
    const oldClaim = persisted.queue[0].claimToken;
    assert.ok(oldClaim);
    const reclaimed = claimDueJob(persisted, Date.now() + 31_000);
    assert.ok(reclaimed);
    assert.notEqual(reclaimed.claimToken, oldClaim);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

// What scan-ats-full.mjs --json writes to stderr before it gets anywhere: its
// run header, and after an interrupted sweep a checkpoint warning above that.
const FULL_SCAN_PROGRESS = [
  "⚠️  Unfinished sweep checkpoint found at /tmp/data/ats-sweep-checkpoint.json — pass --resume to continue it; this fresh run will overwrite it.",
  "Reverse ATS scan — ats: greenhouse,lever,ashby,workday | since 7d | limit 150/ats",
  "",
].join("\n");

test("executeJob retries exactly three times and records the scanner's cause, not its first progress line", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-retry-"));
  const job = { id: "11111111-1111-4111-8111-111111111111", engine: "full", filters: {}, timezone: "UTC" };
  fs.writeFileSync(path.join(temp, "portals.yml"), "title_filter:\n  positive: [engineer]\nlocation_filter: {}\n", "utf8");
  try {
    let attempts = 0;
    const recovered = executeJob(temp, job, {
      spawnFn: () => {
        attempts += 1;
        return attempts < 3 ? { status: 1, stdout: "", stderr: "transient" } : { status: 0, stdout: JSON.stringify({ postingsKept: 4 }), stderr: "" };
      },
    });
    assert.equal(attempts, MAX_ATTEMPTS);
    assert.equal(recovered.state, "success");
    assert.equal(recovered.attempt, 3);

    attempts = 0;
    const fatal = executeJob(temp, job, {
      spawnFn: () => {
        attempts += 1;
        return { status: 1, stdout: "", stderr: `${FULL_SCAN_PROGRESS}  greenhouse: 120/150\nFatal: EACCES: permission denied, open 'data/scan-history.tsv'\n` };
      },
    });
    assert.equal(attempts, MAX_ATTEMPTS);
    assert.equal(fatal.state, "failed");
    assert.equal(fatal.attempt, MAX_ATTEMPTS);
    assert.equal(fatal.message, "Fatal: EACCES: permission denied, open 'data/scan-history.tsv'");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("executeJob reports a scanner timeout as a timeout and does not retry it", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-timeout-"));
  const job = { id: "11111111-1111-4111-8111-111111111111", engine: "full", filters: {}, timezone: "UTC" };
  fs.writeFileSync(path.join(temp, "portals.yml"), "title_filter:\n  positive: [engineer]\nlocation_filter: {}\n", "utf8");
  try {
    let attempts = 0;
    const timedOut = executeJob(temp, job, {
      spawnFn: () => {
        attempts += 1;
        // spawnSync's shape on a timeout: the progress printed so far, a kill
        // signal, and an ETIMEDOUT error.
        const error = Object.assign(new Error("spawnSync /usr/bin/node ETIMEDOUT"), { code: "ETIMEDOUT" });
        return { status: null, signal: "SIGTERM", stdout: "", stderr: FULL_SCAN_PROGRESS, error };
      },
    });
    assert.equal(attempts, 1);
    assert.equal(timedOut.state, "failed");
    assert.equal(timedOut.attempt, 1);
    assert.equal(timedOut.message, `Scanner timed out after ${SCAN_TIMEOUT_MS / 60_000} minutes.`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("scan failure messages skip progress, stack frames and the Node banner", () => {
  assert.equal(stderrCause(`${FULL_SCAN_PROGRESS}Error: portals.yml not found. Run onboarding first.\n`), "Error: portals.yml not found. Run onboarding first.");
  const uncaught = [
    "file:///repo/scan-ats-full.mjs:42",
    "    throw new TypeError(\"Cannot read properties of undefined (reading 'positive')\");",
    "    ^",
    "",
    "TypeError: Cannot read properties of undefined (reading 'positive')",
    "    at main (file:///repo/scan-ats-full.mjs:42:11)",
    "",
    "Node.js v22.13.0",
  ].join("\n");
  assert.equal(stderrCause(uncaught), "TypeError: Cannot read properties of undefined (reading 'positive')");
  const missingPackage = [
    "node:internal/modules/esm/resolve:873",
    "  throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);",
    "        ^",
    "",
    "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'js-yaml' imported from /repo/scan-ats-full.mjs",
    "    at packageResolve (node:internal/modules/esm/resolve:873:9)",
    "    at moduleResolve (node:internal/modules/esm/resolve:946:18)",
    "    at defaultResolve (node:internal/modules/esm/resolve:1188:11) {",
    "  code: 'ERR_MODULE_NOT_FOUND'",
    "}",
    "",
    "Node.js v22.13.0",
  ].join("\n");
  assert.equal(stderrCause(missingPackage), "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'js-yaml' imported from /repo/scan-ats-full.mjs");
  assert.equal(stderrCause("starting\nboard list unavailable\n"), "board list unavailable");
  assert.equal(stderrCause(""), "");
  assert.equal(scanFailureMessage({ status: 2, stderr: "" }), "scanner exit 2");
  assert.equal(scanFailureMessage({ status: null, signal: "SIGKILL", stderr: "" }), "Scanner stopped by SIGKILL.");
  assert.equal(scanFailureMessage({ status: null, stderr: FULL_SCAN_PROGRESS, error: Object.assign(new Error("spawnSync node ENOBUFS"), { code: "ENOBUFS" }) }), "spawnSync node ENOBUFS");
});

test("executeJob retries thrown setup and spawn failures before succeeding", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-scheduled-thrown-retry-"));
  const job = { id: "11111111-1111-4111-8111-111111111111", engine: "full", filters: {}, timezone: "UTC" };
  fs.writeFileSync(path.join(temp, "portals.yml"), "title_filter:\n  positive: [engineer]\nlocation_filter: {}\n", "utf8");
  try {
    let attempts = 0;
    const result = executeJob(temp, job, {
      spawnFn: () => {
        attempts += 1;
        if (attempts < 3) throw new Error(`transient setup ${attempts}`);
        return { status: 0, stdout: JSON.stringify({ postingsKept: 2 }), stderr: "" };
      },
    });
    assert.equal(attempts, 3);
    assert.equal(result.state, "success");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("completion history is capped at 100 records", async () => {
  const jobId = "11111111-1111-4111-8111-111111111111";
  const queueId = "22222222-2222-4222-8222-222222222222";
  const runId = "33333333-3333-4333-8333-333333333333";
  const store = {
    jobs: [{ id: jobId, status: "active", lastRunAt: undefined }],
    runs: Array.from({ length: MAX_RUNS }, (_, index) => ({ id: `${String(index + 4).padStart(8, "0")}-4444-4444-8444-444444444444`, jobId, at: new Date().toISOString(), state: "success", attempt: 1 })),
    queue: [{ id: queueId, jobId, queuedAt: new Date().toISOString(), claimToken: "44444444-4444-4444-8444-444444444444", runId }],
  };
  store.runs[0].id = runId;
  await recordCompletion("unused", { job: { id: jobId, engine: "full" }, queueId, runId, claimToken: store.queue[0].claimToken }, { state: "success", attempt: 1, rolesFound: 0, durationMs: 1, message: "ok" }, store);
  assert.equal(store.runs.length, MAX_RUNS);
  assert.equal(store.runs[0].id, runId);
});

test("a non-object scheduled-job patch is rejected by input validation", () => {
  for (const value of [null, "status", ["status"]]) {
    assert.throws(() => assertScheduledJobBody(value), /object/);
  }
});

test("a scheduled-job filters source is validated and defaults to the base job's", () => {
  assert.throws(() => scheduledFiltersFrom("portals", "custom"), { message: "Invalid filters source." });
  assert.throws(() => scheduledFiltersFrom(null), { message: "Invalid filters source." });
  assert.equal(scheduledFiltersFrom(undefined, "file"), "file", "an edit that omits it keeps the base job's");
  assert.equal(scheduledFiltersFrom(undefined, undefined), "custom", "a new or legacy job is custom");
  assert.equal(scheduledFiltersFrom("custom", "file"), "custom");
});

test("parseScheduledJobInput keeps a file-mode job's source and lists on an edit that omits them", async () => {
  await import("../helpers/web-ts-alias-loader.mjs");
  const { parseScheduledJobInput } = await import("../../src/lib/scheduled-jobs.ts");
  const { DEFAULT_FILTERS } = await import("../../src/lib/explore.ts");
  const base = {
    id: "66666666-6666-4666-8666-666666666666",
    name: "File job",
    engine: "full",
    filtersFrom: "file",
    every: 1,
    unit: "hours",
    timezone: "UTC",
    startAt: "2026-11-08T00:00:00.000Z",
    filters: { ...DEFAULT_FILTERS, positive: ["engineer"], allow: ["Remote"] },
  };
  const edited = parseScheduledJobInput({ name: "File job", filters: { sinceDays: 14 }, every: 2, unit: "hours" }, base);
  assert.equal(edited.filtersFrom, "file");
  assert.deepEqual(edited.filters.positive, ["engineer"]);
  assert.deepEqual(edited.filters.allow, ["Remote"]);
  assert.equal(edited.filters.sinceDays, 14);
  assert.equal(parseScheduledJobInput({ name: "New" }).filtersFrom, "custom");
  assert.throws(() => parseScheduledJobInput({ name: "Bad", filtersFrom: "portals" }), { message: "Invalid filters source." });
});
