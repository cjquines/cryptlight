import * as fs from "node:fs/promises";
import * as url from "node:url";
import { describe, expect, test } from "vitest";
import { IndicatorMatcher } from "./indicators.js";

describe("Indicators", () => {
  const indicators = new IndicatorMatcher();

  test("parse and match", async () => {
    const start = Date.now();
    const data = await fs.readFile(
      url.fileURLToPath(new URL("../scripts/indicators.txt", import.meta.url)),
      "utf-8",
    );
    indicators.parse(data.split("\n"));
    expect(Date.now() - start).toBeLessThan(1000);

    const matches = new Set(
      Array.from(indicators.match(["break", "down"]), ({ start, end, type }) =>
        [start, end, type].join("-"),
      ),
    );

    expect(matches.has("0-0-anagram")).toBe(true);
    expect(matches.has("0-1-anagram")).toBe(true);
    expect(matches.has("1-1-reversal")).toBe(true);
  });
});
