import { test } from "node:test";
import assert from "node:assert/strict";
import { deploymentMode } from "../../src/lib/deployment.mjs";

const LOCAL = { hosted: false, host: null };

test("a public host in the allow-list makes the install hosted", () => {
  assert.deepEqual(deploymentMode({ CAREER_OPS_WEB_ALLOWED_HOSTS: "career.example.com" }), { hosted: true, host: "career.example.com" });
});

test("loopback names only, or no variable, is a local install", () => {
  assert.deepEqual(deploymentMode({ CAREER_OPS_WEB_ALLOWED_HOSTS: "localhost,127.0.0.1" }), LOCAL);
  assert.deepEqual(deploymentMode({ CAREER_OPS_WEB_ALLOWED_HOSTS: "[::1] app.localhost" }), LOCAL);
  assert.deepEqual(deploymentMode({}), LOCAL);
});

test("the host is the first one that is not loopback", () => {
  assert.equal(deploymentMode({ CAREER_OPS_WEB_ALLOWED_HOSTS: "localhost, career.example.com" }).host, "career.example.com");
});

test("an allow-list the server would refuse is not hosted", () => {
  assert.deepEqual(deploymentMode({ CAREER_OPS_WEB_ALLOWED_HOSTS: "on" }), LOCAL);
});
