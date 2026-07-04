import { downloadWordsetData } from "#download";
import { beforeAll, describe, expect, test } from "vitest";
import { runAPITests } from "./testUtil.js";
import { Wordset } from "./wordset.js";

describe("wordset", () => {
  beforeAll(async () => {
    if (runAPITests) {
      Wordset.load(await downloadWordsetData());
    } else {
      Wordset.load({
        wordlist: { test: 5, word: 5 },
        abbreviations: ["about A 50 C 50 CA 107 IS 2 OF 5 ON 94 RE 53"],
      });
    }
  });

  test("literal", async () => {
    expect(await Wordset.literal("hello world").all()).toEqual([
      expect.objectContaining({
        words: ["HELLO", "WORLD"],
        description: 'literal "hello world"',
      }),
    ]);
  });

  test("anagram", async () => {
    expect(await Wordset.literal("this").anagram().all()).toContainEqual(
      expect.objectContaining({
        words: ["SITH"],
        description: "SITH*",
      }),
    );
  });

  test("concat", async () => {
    expect(
      await Wordset.literal("this").concat(Wordset.literal("is")).all(),
    ).toEqual([
      expect.objectContaining({
        words: ["THIS", "IS"],
        description: "THIS+IS",
      }),
    ]);
    expect(
      await Wordset.literal("cat")
        .union(Wordset.literal("cab"))
        .concat(Wordset.literal("dog").union(Wordset.literal("dig")))
        .matches(/^CAT.O.$/),
    ).toEqual([
      expect.objectContaining({
        words: ["CAT", "DOG"],
        description: "CAT+DOG",
      }),
    ]);
  });

  test("delete", async () => {
    expect(
      await Wordset.literal("this").delete(Wordset.literal("is")).all(),
    ).toEqual([
      expect.objectContaining({
        words: ["TH"],
        description: "TH(-is)",
      }),
    ]);

    expect(
      await Wordset.literal("abb").delete(Wordset.literal("ab")).all(),
    ).toEqual([
      expect.objectContaining({
        words: ["B"],
        description: "(-ab)B",
      }),
      expect.objectContaining({
        words: ["B"],
        description: "(-a)B(-b)",
      }),
    ]);
  });

  test("deleteAll", async () => {
    expect(
      await Wordset.literal("abaca").deleteAll(Wordset.literal("a")).all(),
    ).toEqual([
      expect.objectContaining({
        words: ["BC"],
        description: "(-a)B(-a)C(-a)",
      }),
    ]);

    expect(
      await Wordset.literal("caadaabr").deleteAll(Wordset.literal("aa")).all(),
    ).toEqual([
      expect.objectContaining({
        words: ["CDBR"],
        description: "C(-aa)D(-aa)BR",
      }),
    ]);

    expect(
      await Wordset.literal("abc").deleteAll(Wordset.literal("ac")).all(),
    ).toEqual([]);
  });

  test("ends", async () => {
    const result = await Wordset.literal("this").ends().all();

    expect(result).toContainEqual(
      expect.objectContaining({
        words: ["TS"],
        description: "T(-hi)S",
      }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        words: ["TIS"],
        description: "T(-h)IS",
      }),
    );
    expect(result).not.toContainEqual(
      expect.objectContaining({
        words: ["TH"],
      }),
    );
  });

  test("insert", async () => {
    const result = await Wordset.literal("this")
      .insert(Wordset.literal("other"))
      .all();

    expect(result).toContainEqual(
      expect.objectContaining({
        words: ["TOTHERHIS"],
        description: "T(OTHER)HIS",
      }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        words: ["THOTHERIS"],
        description: "TH(OTHER)IS",
      }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        words: ["THIOTHERS"],
        description: "THI(OTHER)S",
      }),
    );
    expect(result).not.toContainEqual(
      expect.objectContaining({
        words: ["THISOTHER"],
      }),
    );
  });

  test("intersect, union", async () => {
    expect(
      await Wordset.intersect([
        Wordset.literal("hello").union(Wordset.literal("world")),
        Wordset.literal("world").union(Wordset.literal("peace")),
      ]).all(),
    ).toEqual([
      expect.objectContaining({
        words: ["WORLD"],
        description: 'literal "world" = literal "world"',
      }),
    ]);
  });

  test("prefix", async () => {
    expect(await Wordset.literal("this").prefix().all()).toEqual([
      expect.objectContaining({ words: ["THI"], description: "THI_" }),
      expect.objectContaining({ words: ["TH"], description: "TH_" }),
      expect.objectContaining({ words: ["T"], description: "T_" }),
    ]);
  });

  test("remove", async () => {
    expect(
      await Wordset.union([
        Wordset.literal("hello"),
        Wordset.literal("abc"),
        Wordset.literal("hello abc"),
        Wordset.literal("hello world"),
      ])
        .remove([0, -3, 4])
        .all(),
    ).toEqual([
      expect.objectContaining({
        words: ["EL"],
        description: "(-h)E(-l)L(-o)",
      }),
      expect.objectContaining({
        words: ["EL", "OL"],
        description: "(-h)E(-l)L(-o) (-w)O(-r)L(-d)",
      }),
    ]);
  });

  test("reverse", async () => {
    expect(await Wordset.literal("this").reverse().all()).toEqual([
      expect.objectContaining({
        words: ["SIHT"],
        description: "SIHT<",
      }),
    ]);
  });

  test("select", async () => {
    expect(
      await Wordset.union([
        Wordset.literal("hello"),
        Wordset.literal("abc"),
        Wordset.literal("hello abc"),
        Wordset.literal("hello world"),
      ])
        .select([0, -3, 4])
        .all(),
    ).toEqual([
      expect.objectContaining({
        words: ["HLO"],
        description: "H_L_O",
      }),
      expect.objectContaining({
        words: ["HLO", "WRD"],
        description: "H_L_O W_R_D",
      }),
    ]);
    expect(
      await Wordset.literal("alpha bravo charlie")
        .select([0])
        .concat(Wordset.literal("x"))
        .matches(/^.{4}$/),
    ).toEqual([
      expect.objectContaining({
        words: ["A", "B", "C", "X"],
        description: "ABC+X",
      }),
    ]);
  });

  test("suffix", async () => {
    expect(await Wordset.literal("this").suffix().all()).toEqual([
      expect.objectContaining({ words: ["HIS"], description: "_HIS" }),
      expect.objectContaining({ words: ["IS"], description: "_IS" }),
      expect.objectContaining({ words: ["S"], description: "_S" }),
    ]);
  });

  test("wordlike", async () => {
    expect(
      await Wordset.union([
        Wordset.literal("test"),
        Wordset.literal("wo rd"),
        Wordset.literal("qwertyuiop"),
      ])
        .wordlike()
        .all(),
    ).toEqual([
      expect.objectContaining({ words: ["TEST"] }),
      expect.objectContaining({ words: ["WO", "RD"] }),
    ]);
  });

  test("substring", async () => {
    const result = await Wordset.literal("bath isl and").substring().all();

    expect(result).toContainEqual(
      expect.objectContaining({
        words: ["BA"],
        description: "BA_",
      }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        words: ["THIS"],
        description: "_TH IS_",
      }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        words: ["THISLAN"],
        description: "_TH ISL AN_",
      }),
    );
  });

  test("matches", async () => {
    const result = await Wordset.literal("things").matches(/^.{4,}$/);
    expect(result.map((d) => d.words.join(""))).toContain("THINGS");
  });

  test("a wordset is single-use", async () => {
    const x = Wordset.literal("ab");
    await expect(x.concat(x).all()).rejects.toThrow(
      "Wordset.run may only be called once",
    );
  });

  test.runIf(runAPITests)("combined operations", async () => {
    const definition = Wordset.synonym("Escort");
    const tadConfused = Wordset.literal("tad").anagram();
    const returningProfit = Wordset.synonym("profit").reverse();
    const wordplay = tadConfused.insert(returningProfit);
    const results = await definition.intersect(wordplay).matches(/^.{6}$/);

    expect(results).toEqual([
      expect.objectContaining({
        words: ["ATTEND"],
      }),
    ]);

    expect(results[0]!.description).toMatchInlineSnapshot(
      `"synonym of "Escort" = AT(TEN<)D*"`,
    );
  });

  test.runIf(runAPITests)("combined operations 2", async () => {
    const wordplay = Wordset.synonym("yard")
      .insert(Wordset.synonym("weak"))
      .reverse();
    const results = await Wordset.synonym("sagging")
      .intersect(wordplay)
      .matches(/^.{6}$/);
    expect(results).toEqual([
      expect.objectContaining({
        words: ["DROOPY"],
      }),
    ]);
  });
});
