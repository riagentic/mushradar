// A starter test — `deno task test`. Cells are pure, so they test in isolation
// (no server, no DOM) with the testCell harness. It imports the cell by name:
// rewrite or delete this when you replace the cell (`deno task check` reads
// tests/ too, so a stale import fails there first).
import { testCell } from "aio/testing";
import { counter } from "../src/cell.ts";

testCell(counter, "increments, adds, and resets", (t) => {
  t.send.increment();
  t.send.increment(5);
  t.expect.state((s) => s.count === 6);
  t.send.reset();
  t.expect.state((s) => s.count === 0);
});
