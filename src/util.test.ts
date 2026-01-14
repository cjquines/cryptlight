import { describe, expect, test } from "vitest";
import { anagrams } from "./util.js";

describe("util", () => {
  test("anagrams", () => {
    expect(anagrams("abc")).toEqual(
      new Set(["abc", "acb", "bac", "bca", "cab", "cba"]),
    );
  });
});
