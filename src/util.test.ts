import { describe, expect, test } from "vitest";
import { anagrams, Interval, Yielder } from "./util.js";

describe("util", () => {
  test("anagrams", () => {
    expect(Array.from(anagrams("abc"))).toEqual([
      "abc",
      "acb",
      "bac",
      "bca",
      "cab",
      "cba",
    ]);
    expect(Array.from(anagrams("aab"))).toEqual(["aab", "aba", "baa"]);
    expect(
      Array.from(
        anagrams("abc", (index, letter) => index !== 0 || letter === "c"),
      ),
    ).toEqual(["cab", "cba"]);
    expect(Array.from(anagrams(""))).toEqual([""]);
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

  test("Interval JSON", () => {
    expect(Interval.of(2, 5).toJSON()).toEqual([2, 5]);
    expect(Interval.positive.toJSON()).toEqual([1, null]);
    expect(Interval.empty.toJSON()).toBeNull();
    expect(JSON.stringify({ length: Interval.positive })).toBe(
      '{"length":[1,null]}',
    );
    for (const interval of [
      Interval.of(2, 5),
      Interval.positive,
      Interval.empty,
    ]) {
      expect(Interval.fromJSON(interval.toJSON())).toEqual(interval);
    }
  });

  test("Yielder", async () => {
    let fired = false;
    setTimeout(() => {
      fired = true;
    }, 0);
    // Not due yet: resolves without reaching the event loop.
    await new Yielder(1e9).yield();
    expect(fired).toBe(false);
    await new Yielder(0).yield();
    expect(fired).toBe(true);
  });
});
