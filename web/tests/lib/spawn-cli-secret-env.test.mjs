// web/tests/lib/spawn-cli-secret-env.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnHeadlessCli } from "../../src/lib/spawn-cli.mjs";
import { CAPS } from "../../src/lib/worker-capabilities.mjs";

const PRINT_ENV_KEYS = "process.stdout.write(JSON.stringify(Object.keys(process.env)))";
// Node hands the arguments after `-e <script> --` to the script, so these pass Claude's fencing check and do nothing.
const CLAUDE_FENCE_ARGS = ["--", "--strict-mcp-config", "--disallowedTools", "Write,Edit,MultiEdit,NotebookEdit,Bash,Task"];
const MADE_UP_ENV = {
  PUBLISH_API_KEY: "x", GMAIL_REFRESH_TOKEN: "x", PRIVACY_BYPASS_TOKEN: "x", ANTHROPIC_API_KEY: "x",
  OPENAI_API_KEY: "x", GEMINI_API_KEY: "x", OPENROUTER_API_KEY: "x",
};

function childEnvKeys(cliId, capabilities) {
  return new Promise((resolve) => {
    const args = ["-e", PRINT_ENV_KEYS, ...(cliId === "claude" ? CLAUDE_FENCE_ARGS : [])];
    const child = spawnHeadlessCli(process.execPath, args, { env: { ...process.env, ...MADE_UP_ENV } }, { cliId, capabilities });
    let out = "";
    child.stdout.on("data", (c) => { out += c; });
    child.on("close", () => resolve(JSON.parse(out)));
  });
}

test("a read-only worker does not inherit career-ops' own secrets, and keeps the agent's", async () => {
  const keys = await childEnvKeys("gemini", CAPS.networkReadOnly);
  assert.equal(keys.includes("PUBLISH_API_KEY"), false);
  assert.equal(keys.includes("GMAIL_REFRESH_TOKEN"), false);
  assert.equal(keys.includes("PRIVACY_BYPASS_TOKEN"), false);
  assert.equal(keys.includes("GEMINI_API_KEY"), true);
});

test("a read-only Claude child keeps its own key and none of the other agents' keys", async () => {
  const keys = await childEnvKeys("claude", CAPS.networkReadOnly);
  assert.equal(keys.includes("ANTHROPIC_API_KEY"), true);
  for (const key of ["OPENAI_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "PUBLISH_API_KEY"]) {
    assert.equal(keys.includes(key), false, key);
  }
});

test("a read-only Gemini child does not inherit Claude's or OpenAI's key", async () => {
  const keys = await childEnvKeys("gemini", CAPS.localReadOnly);
  assert.equal(keys.includes("ANTHROPIC_API_KEY"), false);
  assert.equal(keys.includes("OPENAI_API_KEY"), false);
});

test("a CLI that can be pointed at any provider keeps every agent key", async () => {
  const keys = await childEnvKeys("opencode", CAPS.localReadOnly);
  for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY"]) {
    assert.equal(keys.includes(key), true, key);
  }
  assert.equal(keys.includes("PUBLISH_API_KEY"), false);
});
