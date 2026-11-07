// usage: node probe.mjs <inbox|long> <runs> <cpuRate> <outPrefix>
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../../web/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const [kind, runsArg, rateArg, out] = process.argv.slice(2);
const runs = Number(runsArg), rate = Number(rateArg);
const base = process.env.BASE || (kind === "inbox" ? "http://127.0.0.1:47812" : "http://127.0.0.1:47811");
const target = kind === "inbox" ? `${base}/pipeline` : `${base}/pipeline?tab=ALL&sort=tracker&dir=1`;
const init = (kind) => {
  const t0 = performance.now();
  window.__log = []; window.__dump = null;
  const snap = (why) => {
    const b = document.body;
    if (!b) return;
    const e = { t: Math.round(performance.now() - t0), why, rs: document.readyState };
    if (kind === "inbox") {
      const lis = [...document.querySelectorAll("li")].filter((li) => li.textContent.includes("Fixture Alpha"));
      const btns = new Set(); for (const li of lis) for (const x of li.querySelectorAll('[title="Skip — hide from the inbox"]')) btns.add(x);
      e.alphaLi = lis.length; e.alphaSkip = btns.size; e.ul = document.querySelectorAll("ul").length;
      e.skipAll = document.querySelectorAll('[title="Skip — hide from the inbox"]').length;
      e.s0 = !!document.getElementById("S:0"); e.skel = !!document.querySelector('[aria-label="Loading pipeline"]');
      const u = lis[0]?.closest("ul"); e.hyd = !!u && Object.keys(u).some((k) => k.startsWith("__reactFiber"));
      if (e.alphaSkip >= 2 && !window.__dump) {
        window.__dump = { t: e.t, html: document.body.innerHTML, parents: [...btns].map((x) => { const p = []; let n = x; while (n && n !== document.body) { p.push(n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (n.hidden ? "[hidden]" : "")); n = n.parentElement; } return p.join("<"); }) };
      }
    } else {
      const tb = document.querySelector("tbody[aria-busy]");
      e.sh = b.scrollHeight; e.tr = document.querySelectorAll("tbody tr").length; e.dataTr = document.querySelectorAll("tr[data-application-key]").length;
      e.skel = !!document.querySelector('[aria-label="Loading pipeline"]'); e.s0 = !!document.getElementById("S:0");
      e.tbHidden = tb ? tb.hidden : null;
      e.hyd = !!tb && Object.keys(tb).some((k) => k.startsWith("__reactFiber"));
      if (e.s0 && e.tr > 20 && !window.__dump) { const path = (x) => { const p = []; let n = x; while (n && n !== document.body) { p.push(n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (n.hidden ? "[hidden]" : "")); n = n.parentElement; } return p.join("<"); }; window.__dump = { t: e.t, html: document.body.innerHTML, parents: [...document.querySelectorAll("tbody")].map((tb) => tb.querySelectorAll("tr").length + " rows in " + path(tb)) }; }
    }
    const last = window.__log[window.__log.length - 1];
    const key = JSON.stringify({ ...e, t: 0, why: 0 });
    if (!last || last.key !== key || why === "tick") window.__log.push({ ...e, key });
  };
  new MutationObserver(() => snap("mut")).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
  const id = setInterval(() => snap("tick"), kind === "inbox" ? 50 : 100);
  setTimeout(() => clearInterval(id), 6000);
  addEventListener("DOMContentLoaded", () => snap("dcl"));
  addEventListener("load", () => snap("load"));
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
for (let i = 0; i < runs; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  if (rate > 1) { const c = await ctx.newCDPSession(page); await c.send("Emulation.setCPUThrottlingRate", { rate }); }
  if (process.env.NET_KBPS) { const c = await ctx.newCDPSession(page); await c.send("Network.enable"); await c.send("Network.emulateNetworkConditions", { offline: false, latency: Number(process.env.NET_LAT || 20), downloadThroughput: Number(process.env.NET_KBPS) * 1024, uploadThroughput: 1e6 }); }
  await page.addInitScript(init, kind);
  const msgs = []; page.on("console", (m) => msgs.push(m.type() + ": " + m.text().slice(0, 400))); page.on("pageerror", (e) => msgs.push("pageerror: " + e.message.slice(0, 400)));
  if (kind === "inbox") for (const c of ["alpha", "beta"]) await page.request.post(`${base}/api/inbox/skip`, { data: { url: `https://example.com/fixture-${c}`, done: false } });
  const tGoto = Date.now();
  await page.goto(target);
  const gotoMs = Date.now() - tGoto;
  let atGoto;
  if (kind === "inbox") {
    atGoto = await page.locator("li").filter({ hasText: "Fixture Alpha" }).getByTitle("Skip — hide from the inbox").count();
  } else {
    atGoto = await page.evaluate(() => ({ sh: document.body.scrollHeight, t: Math.round(performance.now()) }));
  }
  await page.waitForTimeout(kind === "inbox" ? 3000 : 3000);
  const log = await page.evaluate(() => window.__log.map(({ key, ...r }) => r));
  const dump = await page.evaluate(() => window.__dump);
  const r = { run: i, gotoMs, atGoto, log, msgs };
  if (msgs.length) console.log("  console:", msgs.join(" | "));
  if (dump) { fs.writeFileSync(`${out}-dump-${i}.html`, dump.html); r.dump = { t: dump.t, parents: dump.parents }; }
  results.push(r);
  if (kind === "inbox") {
    const max = Math.max(...log.map((e) => e.alphaSkip ?? 0));
    console.log(`run ${i} goto ${gotoMs}ms countAtGoto=${atGoto} maxAlphaSkip=${max}${dump ? " dump@" + dump.t + "ms" : ""}`);
  } else {
    const loadE = log.find((e) => e.why === "load");
    const over4k = log.find((e) => e.sh > 4000);
    console.log(`run ${i} goto ${gotoMs}ms shAtGoto=${atGoto.sh} (page t=${atGoto.t}) load@${loadE?.t} sh@load=${loadE?.sh} first>4000@${over4k?.t ?? "never"}`);
  }
  await ctx.close();
}
fs.writeFileSync(`${out}.json`, JSON.stringify(results, null, 1));
await browser.close();
