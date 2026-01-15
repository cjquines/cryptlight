import { describe, expect, test } from "vitest";
import { datamuse, queryParts } from "./datamuse.js";
import { runAPITests } from "./testUtil.js";

describe("datamuse", () => {
  test("query parts", () => {
    expect(
      Array.from(
        queryParts({
          adjectiveBefore: ["ocean", "water"],
          topicWords: ["temperature", "heat"],
        }),
      ),
    ).toMatchInlineSnapshot(`
      [
        [
          "rel_jjb",
          "ocean",
        ],
        [
          "rel_jjb",
          "water",
        ],
        [
          "topics",
          "temperature,heat",
        ],
      ]
    `);
  });

  test.runIf(runAPITests)("query", async () => {
    const result = await datamuse({
      meansLike: "ringing in the ears",
    });
    expect(result[0]!).toEqual(
      expect.objectContaining({
        word: "tinnitus",
      }),
    );
  });
});
