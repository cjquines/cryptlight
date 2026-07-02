import { testTree } from "@lezer/generator/test";
import { describe, expect, test } from "vitest";
import { parser } from "./parser.js";

function parses(input: string, spec: string) {
  expect(() => {
    testTree(parser.parse(input), spec);
  }).not.toThrow();
}

describe("parser", () => {
  test("postfix sigils", () => {
    parses(
      `tad* + profit<`,
      `Program(Concat(Postfix(Word, Anagram), Postfix(Word, Reverse)))`,
    );
    parses(
      `sailor?<`,
      `Program(Postfix(Postfix(Word, Lookup), Reverse))`,
    );
  });

  test("prefix binds tighter than concat", () => {
    parses(
      `head:pets + in`,
      `Program(Concat(Prefix(OpName, Word), Word))`,
    );
  });

  test("call binds tighter than prefix", () => {
    parses(
      `centers:laze.reverse`,
      `Program(Prefix(OpName, Call(Word, OpName)))`,
    );
  });

  test("method call with expression and number args", () => {
    parses(
      `apps.around(laze.centers)`,
      `Program(Call(Word, OpName, ArgList(Argument(Call(Word, OpName)))))`,
    );
    parses(
      `x.select(0, 2, 4)`,
      `Program(Call(Word, OpName, ArgList(Argument(Number), Argument(Number), Argument(Number))))`,
    );
  });

  test("index and intersect", () => {
    parses(`might[-1]`, `Program(Index(Word, Number))`);
    parses(
      `pets.head = dogs`,
      `Program(Intersect(Call(Word, OpName), Word))`,
    );
  });
});
