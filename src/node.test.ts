import { beforeAll, describe, expect, test } from "vitest";
import { build, type Node, planToJSON } from "./node.js";
import { Wordset } from "./wordset.js";

/** AT(TEN)D, with values in place of synonyms. */
function attend(overrides: Record<string, Partial<Node>> = {}): Node {
  const node = (base: Node): Node =>
    ({ ...base, ...overrides[base.id] }) as Node;
  return node({
    id: "m",
    op: "match",
    pattern: "^.{6}$",
    children: [
      node({
        id: "i",
        op: "intersect",
        children: [
          node({ id: "d", op: "values", words: ["attend", "escort"] }),
          node({
            id: "w",
            op: "insert",
            children: [
              node({
                id: "a",
                op: "anagram",
                children: [node({ id: "t", op: "literal", text: "tad" })],
              }),
              node({
                id: "r",
                op: "reverse",
                children: [node({ id: "p", op: "values", words: ["net"] })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

async function run(root: Node) {
  return (await build(root).all()).map((d) => d.toJSON());
}

describe("node", () => {
  beforeAll(() => {
    Wordset.load({ wordlist: { test: 5, word: 5 }, abbreviations: [] });
  });

  test("build and serialize", async () => {
    const [result, ...rest] = await run(attend());
    expect(rest).toEqual([]);
    expect(result).toEqual(
      expect.objectContaining({ words: ["ATTEND"], node: "i" }),
    );
    const [definition, wordplay] = result!.parents;
    expect(definition!.node).toBe("d");
    expect(wordplay!.node).toBe("w");
    const [container, content] = wordplay!.parents;
    expect(container!.node).toBe("a");
    expect(content!.node).toBe("r");
    expect(content!.parents[0]!.node).toBe("p");
  });

  test("pin", async () => {
    const results = await run(
      attend({
        p: { pin: ["net"] },
        a: { pin: ["atd"] },
        // A pinned subtree isn't built, so its contents don't matter.
        r: { pin: ["ten"] },
      }),
    );
    expect(results.map((r) => r.words)).toEqual([["ATTEND"]]);
    const [, wordplay] = results[0]!.parents;
    expect(wordplay!.parents.map((p) => [p.node, p.words])).toEqual([
      ["a", ["ATD"]],
      ["r", ["TEN"]],
    ]);
  });

  test("disabled", async () => {
    // Without the pattern, all 6-letter results are still found.
    expect(await run(attend({ m: { disabled: true } }))).toHaveLength(1);
    expect(() => build(attend({ w: { disabled: true } }))).toThrow("one-child");
  });

  test("exclude", async () => {
    expect(await run(attend({ d: { exclude: ["attend"] } }))).toEqual([]);
    const [result] = await run(attend({ i: { exclude: ["escort"] } }));
    expect(result!.node).toBe("i");
  });

  test("duplicate ids", () => {
    expect(() => build(attend({ t: { id: "p" } }))).toThrow("duplicate");
  });

  test("flatMap", async () => {
    const results = await run({
      id: "f",
      op: "flatMap",
      fn: "(words) => [words.map((word) => word + 's').join(' ')]",
      name: "plural",
      children: [{ id: "l", op: "literal", text: "big top" }],
    });
    expect(results).toEqual([
      expect.objectContaining({
        words: ["BIGS", "TOPS"],
        description: "BIGS TOPS (plural of BIGTOP)",
        node: "f",
      }),
    ]);
    expect(() =>
      build({
        id: "f",
        op: "flatMap",
        fn: "1",
        children: [{ id: "l", op: "literal", text: "x" }],
      }),
    ).toThrow("not a function");
  });

  test("toJSON shares parents", async () => {
    const results = await run({
      id: "c",
      op: "concat",
      children: [
        { id: "l", op: "literal", text: "a" },
        { id: "v", op: "values", words: ["b", "c"] },
      ],
    });
    expect(results).toHaveLength(2);
    expect(results[0]!.parents[0]).toBe(results[1]!.parents[0]);
  });

  test("planToJSON", () => {
    const plan = planToJSON(
      build(attend({ r: { exclude: ["ten"] }, d: { pin: ["attend"] } })).plan(),
    );
    const flat: Record<string, unknown> = {};
    const walk = (p: typeof plan) => {
      flat[p.node] = { length: p.length, children: p.children.length };
      p.children.forEach(walk);
    };
    walk(plan);
    expect(flat).toEqual({
      m: { length: [0, null], children: 1 },
      i: { length: [6, 6], children: 2 },
      d: { length: [6, 6], children: 0 },
      w: { length: [6, 6], children: 2 },
      a: { length: [3, 3], children: 1 },
      t: { length: [3, 3], children: 0 },
      // The exclude wrapper collapses into r.
      r: { length: [3, 3], children: 1 },
      p: { length: [3, 3], children: 0 },
    });
  });
});
