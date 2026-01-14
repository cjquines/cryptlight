import { describe, expect, test } from "vitest";
import { anagrams, product } from "./util.js";

describe("util", () => {
  test("anagrams", () => {
    expect(anagrams("abc")).toEqual(
      new Set(["abc", "acb", "bac", "bca", "cab", "cba"]),
    );
  });

  test("product", () => {
    expect(Array.from(product([1, 2, 3], [4, 5, 6, 7, 8]))).toEqual([
      [1, 4],
      [2, 4],
      [1, 5],
      [2, 5],
      [3, 4],
      [3, 5],
      [1, 6],
      [2, 6],
      [3, 6],
      [1, 7],
      [2, 7],
      [3, 7],
      [1, 8],
      [2, 8],
      [3, 8],
    ]);
  });
});
