import { beforeAll, describe, expect, test } from "vitest";
import { Wordset } from "../wordset.js";
import { toAST } from "./ast.js";
import { query } from "./dsl.js";

describe("ast", () => {
  test("sigils and prefix desugar to calls", () => {
    expect(toAST("pets*")).toEqual({
      type: "call",
      op: "anagram",
      args: [],
      recv: { type: "word", word: "pets" },
    });
    // profit< is the same shape as profit.reverse
    expect(toAST("profit<")).toEqual(toAST("profit.reverse"));
    // head:pets is the same shape as pets.head
    expect(toAST("head:pets")).toEqual(toAST("pets.head"));
  });

  test("quotes are stripped, spaces kept", () => {
    expect(toAST('"hot dog"')).toEqual({ type: "word", word: "hot dog" });
  });

  test("intersect and args", () => {
    expect(toAST("x.select(0, 2, 4)")).toEqual({
      type: "call",
      op: "select",
      recv: { type: "word", word: "x" },
      args: [
        { type: "num", value: 0 },
        { type: "num", value: 2 },
        { type: "num", value: 4 },
      ],
    });
    expect(toAST("apple = fruits")).toEqual({
      type: "intersect",
      left: { type: "word", word: "apple" },
      right: { type: "word", word: "fruits" },
    });
  });
});

describe("lower", () => {
  beforeAll(() => {
    Wordset.load({
      wordlist: { test: 5, word: 5 },
      abbreviations: ["about A 50 C 50 CA 107 IS 2 OF 5 ON 94 RE 53"],
    });
  });

  test("literal/lookup rule via length bounds", () => {
    // A bare, unoperated word is a lookup (unbounded length).
    expect(query("test").length.max).toBe(Infinity);
    // Applying an op makes it a literal (finite length).
    expect(query("test.reverse").length.max).toBe(4);
    expect(query("test<").length.max).toBe(4);
    // A trailing `?` forces a lookup even under an op.
    expect(query("test?.reverse").length.max).toBe(Infinity);
  });

  test("operated words are literals", async () => {
    expect(await query("abc.reverse").all()).toEqual([
      expect.objectContaining({ words: ["CBA"], description: "CBA<" }),
    ]);
    // The sigil form lowers identically.
    expect(await query("abc<").all()).toEqual(await query("abc.reverse").all());
  });

  test("concat treats both operands as literals", async () => {
    expect(await query("pets + dogs").all()).toEqual([
      expect.objectContaining({
        words: ["PETS", "DOGS"],
        description: "PETS+DOGS",
      }),
    ]);
  });

  test("head/tail and index lower to select", async () => {
    expect(await query("pets.head").all()).toEqual([
      expect.objectContaining({ words: ["P"], description: "P_" }),
    ]);
    expect(await query("might[-1]").all()).toEqual([
      expect.objectContaining({ words: ["T"], description: "_T" }),
    ]);
    expect(await query("pets[0]").all()).toEqual(await query("pets.head").all());
  });

  test("around and inside are the two containment directions", async () => {
    expect(await query("apps.around(laze)").all()).toEqual([
      expect.objectContaining({ words: ["ALAZEPPS"], description: "A(LAZE)PPS" }),
      expect.objectContaining({ words: ["APLAZEPS"], description: "AP(LAZE)PS" }),
      expect.objectContaining({ words: ["APPLAZES"], description: "APP(LAZE)S" }),
    ]);
    expect(await query("apps.inside(laze)").all()).toEqual([
      expect.objectContaining({ words: ["LAPPSAZE"], description: "L(APPS)AZE" }),
      expect.objectContaining({ words: ["LAAPPSZE"], description: "LA(APPS)ZE" }),
      expect.objectContaining({ words: ["LAZAPPSE"], description: "LAZ(APPS)E" }),
    ]);
  });

  test("bad ops and args throw", () => {
    expect(() => query("pets.nope")).toThrow(/unknown op/);
    expect(() => query("pets.head(3)")).toThrow(/expects 0/);
    expect(() => query("pets.alternate(2)")).toThrow(/offset of 0 or 1/);
    expect(() => query("(pets + dogs)?")).toThrow(/lookup/);
  });
});
