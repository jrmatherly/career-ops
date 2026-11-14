// The Portals page's enable toggle keeps an entry's group: key.
import test from "node:test";
import assert from "node:assert/strict";

import { setCompanyEnabledText } from "../../src/lib/portals-config.mjs";

test("toggling a grouped company keeps its group", () => {
  const source = "tracked_companies:\n  - name: Fixture Alpha\n    careers_url: https://example.com/alpha\n    group: weekly\n    enabled: true\n  - name: Fixture Beta\n    careers_url: https://example.com/beta\n";
  for (const [name, enabled] of [["Fixture Alpha", false], ["Fixture Beta", false]]) {
    const next = setCompanyEnabledText(source, name, enabled);
    assert.match(next, /enabled: false/);
    assert.match(next, /^ {4}group: weekly$/m);
  }
});
