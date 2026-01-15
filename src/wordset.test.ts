import { Cromulence } from "cromulence";
import { describe, expect, test } from "vitest";
import * as Iter from "./iterable.js";
import { Wordset } from "./wordset.js";

describe("wordset", () => {
  Wordset.cromulence = new Cromulence({
    test: 5,
    word: 5,
  });

  test("literal", () => {
    expect(Array.from(Wordset.literal("hello world"))).toEqual([
      expect.objectContaining({
        words: ["HELLO", "WORLD"],
        description: 'literal "hello world"',
      }),
    ]);
  });

  test("anagram", () => {
    expect(Array.from(Wordset.literal("this").anagram())).toContainEqual(
      expect.objectContaining({
        words: ["SITH"],
        description: "SITH*",
      }),
    );
  });

  test("concat", () => {
    expect(
      Array.from(Wordset.literal("this").concat(Wordset.literal("is"))),
    ).toEqual([
      expect.objectContaining({
        words: ["THIS", "IS"],
        description: "THIS+IS",
      }),
    ]);
  });

  test("delete", () => {
    expect(
      Array.from(Wordset.literal("this").delete(Wordset.literal("is"))),
    ).toEqual([
      expect.objectContaining({
        words: ["TH"],
        description: "TH(-is)",
      }),
    ]);

    expect(
      Array.from(Wordset.literal("abb").delete(Wordset.literal("ab"))),
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

  test("deleteAll", () => {
    expect(
      Array.from(Wordset.literal("abaca").deleteAll(Wordset.literal("a"))),
    ).toEqual([
      expect.objectContaining({
        words: ["BC"],
        description: "(-a)B(-a)C(-a)",
      }),
    ]);

    expect(
      Array.from(Wordset.literal("abc").deleteAll(Wordset.literal("ac"))),
    ).toEqual([]);
  });

  test("ends", () => {
    const result = Array.from(Wordset.literal("this").ends());

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

  test("insert", () => {
    const result = Array.from(
      Wordset.literal("this").insert(Wordset.literal("other")),
    );

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

  test("intersect", () => {
    expect(
      Array.from(
        new Wordset(
          Iter.chain([Wordset.literal("hello"), Wordset.literal("world")]),
        ).intersect(
          new Wordset(
            Iter.chain([Wordset.literal("world"), Wordset.literal("peace")]),
          ),
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        words: ["WORLD"],
        description: 'literal "world" = literal "world"',
      }),
    ]);
  });

  test("match", () => {
    expect(
      Array.from(
        new Wordset(
          Iter.chain([
            Wordset.literal("THIS"),
            Wordset.literal("IS"),
            Wordset.literal("A"),
            Wordset.literal("TEST"),
          ]),
        ).match(/.{4}/),
      ).flatMap((item) => item.words),
    ).toEqual(["THIS", "TEST"]);
  });

  test("prefix", () => {
    expect(Array.from(Wordset.literal("this").prefix())).toEqual([
      expect.objectContaining({ words: ["THI"], description: "THI_" }),
      expect.objectContaining({ words: ["TH"], description: "TH_" }),
      expect.objectContaining({ words: ["T"], description: "T_" }),
    ]);
  });

  test("remove", () => {
    expect(
      Array.from(
        new Wordset(
          Iter.chain([
            Wordset.literal("hello"),
            Wordset.literal("abc"),
            Wordset.literal("hello abc"),
            Wordset.literal("hello world"),
          ]),
        ).remove([0, -3, 4]),
      ),
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

  test("reverse", () => {
    expect(Array.from(Wordset.literal("this").reverse())).toEqual([
      expect.objectContaining({
        words: ["SIHT"],
        description: "SIHT<",
      }),
    ]);
  });

  test("select", () => {
    expect(
      Array.from(
        new Wordset(
          Iter.chain([
            Wordset.literal("hello"),
            Wordset.literal("abc"),
            Wordset.literal("hello abc"),
            Wordset.literal("hello world"),
          ]),
        ).select([0, -3, 4]),
      ),
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
  });

  test("suffix", () => {
    expect(Array.from(Wordset.literal("this").suffix())).toEqual([
      expect.objectContaining({ words: ["HIS"], description: "_HIS" }),
      expect.objectContaining({ words: ["IS"], description: "_IS" }),
      expect.objectContaining({ words: ["S"], description: "_S" }),
    ]);
  });

  test("wordlike", () => {
    expect(
      Array.from(
        new Wordset(
          Iter.chain([
            Wordset.literal("test"),
            Wordset.literal("wo rd"),
            Wordset.literal("nonexistent"),
          ]),
        ).wordlike(),
      ),
    ).toEqual([
      expect.objectContaining({ words: ["TEST"] }),
      expect.objectContaining({ words: ["WO", "RD"] }),
    ]);
  });

  test("substring", () => {
    const result = Array.from(Wordset.literal("bath isl and").substring());

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

  test.skip("combined operations", () => {
    const definition = Wordset.literal("attend");
    const tadConfused = Wordset.literal("tad").anagram();
    const returningProfit = Wordset.literal("net").reverse();
    const wordplay = tadConfused.insert(returningProfit);
    const results = Array.from(definition.intersect(wordplay).match(/.{6}/));

    expect(results).toMatchInlineSnapshot(`
      [
        {
          "description": "literal "attend" = AT(TEN)D",
          "parents": [
            {
              "description": "literal "attend"",
              "parents": [],
              "words": [
                "ATTEND",
              ],
            },
            {
              "description": "AT(TEN)D",
              "parents": [
                {
                  "description": "ATD*",
                  "parents": [
                    {
                      "description": "literal "tad"",
                      "parents": [],
                      "words": [
                        "TAD",
                      ],
                    },
                  ],
                  "words": [
                    "ATD",
                  ],
                },
                {
                  "description": "TEN<",
                  "parents": [
                    {
                      "description": "literal "net"",
                      "parents": [],
                      "words": [
                        "NET",
                      ],
                    },
                  ],
                  "words": [
                    "TEN",
                  ],
                },
              ],
              "words": [
                "ATTEND",
              ],
            },
          ],
          "words": [
            "ATTEND",
          ],
        },
      ]
    `);
  });
});
