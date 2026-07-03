import { describe, expect, test } from "vitest";
import { Regex } from "./regex.js";
import { Interval } from "./util.js";

describe("regex", () => {
  test("length", () => {
    expect(Regex.length(/test/)).toEqual(Interval.of(4));
    expect(Regex.length(/t.st/)).toEqual(Interval.of(4));
    expect(Regex.length(/.*/)).toEqual(Interval.of(0, Infinity));
    expect(Regex.length(/fo?o/)).toEqual(Interval.of(2, 3));
    expect(Regex.length(/mo{2}/)).toEqual(Interval.of(3, 3));
    expect(Regex.length(/mo{2,}/)).toEqual(Interval.of(3, Infinity));
    expect(Regex.length(/mo{2,7}/)).toEqual(Interval.of(3, 8));
    expect(Regex.length(/s?e?q?u?e?n?c?e?/)).toEqual(Interval.of(0, 8));
  });
});
