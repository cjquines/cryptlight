import { Cromulence } from "cromulence";
import { describe, expect, test } from "vitest";
import { Wordset } from "./wordset.js";

describe("wordset", () => {
  Wordset.cromulence = new Cromulence({
    word: 5,
  });

  test("literal", () => {
    expect(Array.from(Wordset.literal("hello world").items)).toEqual([
      {
        words: ["HELLO", "WORLD"],
        description: 'literal "hello world"',
        parents: [],
      },
    ]);
  });
});
