import "./_guard";
import { test } from "node:test";
import assert from "node:assert/strict";
import { translateError } from "../src/lib/errors";

test("English messages pass through unchanged", () => {
  assert.equal(translateError("Cart is empty", "en"), "Cart is empty");
});

test("known messages and patterns are translated to Amharic", () => {
  assert.equal(translateError("Cart is empty", "am"), "ጋሪው ባዶ ነው");
  assert.equal(translateError("Bread: not enough stock", "am"), "Bread፦ በቂ ክምችት የለም");
  assert.match(translateError("Too many wrong PINs. Try again in 15 minutes, or ask the owner to reset your PIN.", "am"), /15 ደቂቃ/);
});

test("an unknown message is shown as it is rather than hidden", () => {
  assert.equal(translateError("Something new", "am"), "Something new");
});

test("every message the business rules can throw has an Amharic version", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const missing: string[] = [];
  for (const f of readdirSync("src/lib").filter((n) => n.endsWith(".ts"))) {
    const src = readFileSync(`src/lib/${f}`, "utf8");
    // Fixed messages only: `new XError("...")` and zod `.min(n, "...")`; messages with ${} are covered by patterns.
    for (const m of src.matchAll(/(?:Error\(|\.min\(\d+, )"([^"$]+)"/g)) {
      if (translateError(m[1], "am") === m[1]) missing.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
