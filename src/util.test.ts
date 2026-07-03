import { describe, expect, test } from "vitest";
import { anagrams, Interval } from "./util.js";

describe("util", () => {
  test("anagrams", () => {
    expect(anagrams("abc")).toEqual(
      new Set(["abc", "acb", "bac", "bca", "cab", "cba"]),
    );
  });

  test("Interval", () => {
    expect(Array.from(Interval.of(1, 3))).toEqual([1, 2, 3]);
    expect(Interval.of(1, 3).length).toEqual(3);
    expect(Interval.of(1, 3).isEmpty()).toEqual(false);

    expect(Interval.of(1, 3).add(Interval.of(2, 4))).toEqual(Interval.of(3, 7));
    expect(Interval.of(1, 3).sub(Interval.of(2, 4))).toEqual(
      Interval.of(-3, 1),
    );
    expect(Interval.of(1, 3).meet(Interval.of(2, 4))).toEqual(
      Interval.of(2, 3),
    );
  });
});
