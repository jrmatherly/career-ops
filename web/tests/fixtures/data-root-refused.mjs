// node tests/fixtures/data-root-refused.mjs prints a data root that sits inside
// a stand-in Claude Code plugin install copy: <tmp>/plugins/cache/career-ops/data.
// A server started with CLAUDE_CONFIG_DIR=<tmp> refuses it. The runner removes
// <tmp> after the suite.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const config = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-refused-"));
const root = path.join(config, "plugins", "cache", "career-ops", "data");
fs.mkdirSync(root, { recursive: true });
console.log(root);
