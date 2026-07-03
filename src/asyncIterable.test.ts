import { describe, expect, test } from "vitest";
import * as AsyncIter from "./asyncIterable.js";

describe("asyncIterable", () => {
  test("product", async () => {
    expect(
      await AsyncIter.toArray(
        AsyncIter.product(
          AsyncIter.from([1, 2, 3]),
          AsyncIter.from([4, 5, 6, 7, 8]),
        ),
      ),
    ).toEqual([
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
