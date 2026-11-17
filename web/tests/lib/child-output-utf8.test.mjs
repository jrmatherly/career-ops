// A multibyte character split across two chunks of child output must survive, and every child
// stream whose data handler reads its chunk must be set to utf8 in the same file.
// Run (from web/): node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/child-output-utf8.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { markTrackerReady } from "../../src/lib/pdf-render.mjs";
import { listTree } from "../../../lib/walk-tree.mjs";

function fakeStream() { // same contract as pdf-render.test.mjs: Buffers until setEncoding is called
  const s = new EventEmitter(); let decoder = null;
  s.setEncoding = (enc) => { decoder = new StringDecoder(enc); };
  s.push = (buf) => s.emit("data", decoder ? decoder.write(buf) : buf);
  return s;
}
test("markTrackerReady decodes a character split across two chunks", async () => {
  const bytes = Buffer.from(JSON.stringify({ ok: true, company: "Café Ünïcode 日本" }));
  const cut = bytes.indexOf(0xc3) + 1; // inside the two bytes of "é"
  const spawnFn = () => { const c = new EventEmitter(); c.stdout = fakeStream(); c.stderr = fakeStream();
    queueMicrotask(() => { c.stdout.push(bytes.subarray(0, cut)); c.stdout.push(bytes.subarray(cut)); c.emit("close", 0); }); return c; };
  const result = await markTrackerReady({ spawnFn, execPath: "node", coreRoot: "/core", reportNum: "001" });
  assert.equal(result.data?.company, "Café Ünïcode 日本");
});

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src");
// The one exemption: cv/ingest forwards Buffers to lib/cv/ingest-output.mjs, which decodes with a StringDecoder.
const EXEMPT = new Set(["app/api/cv/ingest/route.ts"]);
test("every data handler that reads its chunk is on a stream set to utf8", () => {
  const files = listTree(SRC, { match: /\.(mjs|ts|tsx)$/ }).map((f) => path.relative(SRC, f));
  const offenders = [];
  for (const rel of files) {
    if (EXEMPT.has(rel.split(path.sep).join("/"))) continue;
    const text = fs.readFileSync(path.join(SRC, rel), "utf8");
    const handlers = new Map();
    // A handler written `() => …` ignores its chunk and needs no encoding.
    for (const m of text.matchAll(/([\w.]+?)\??\.on\(\s*["']data["']\s*,(?!\s*\(\s*\)\s*=>)/g)) handlers.set(m[1], (handlers.get(m[1]) ?? 0) + 1);
    for (const [stream, count] of handlers) {
      const set = text.split(`${stream}.setEncoding(`).length - 1 + text.split(`${stream}?.setEncoding(`).length - 1;
      if (set < count) offenders.push(`${rel}: ${stream} (${count} handler(s), ${set} setEncoding)`);
    }
  }
  assert.deepEqual(offenders, []);
});
