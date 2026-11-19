import { describe, expect, test } from "vitest";
import { Pattern } from "./pattern.js";
import { Interval } from "./util.js";

describe("regex", () => {
  test("parse throws", () => {
    expect(() => Pattern.parse(/test/)).toThrow("anchored");
    expect(() => Pattern.parse(/^test/)).toThrow("anchored");
    expect(() => Pattern.parse(/test$/)).toThrow("anchored");
  });

  test("length", () => {
    expect(Pattern.parse(/^test$/).length).toEqual(Interval.of(4));
    expect(Pattern.parse(/^t.st$/).length).toEqual(Interval.of(4));
    expect(Pattern.parse(/^.*$/).length).toEqual(Interval.of(0, Infinity));
    expect(Pattern.parse(/^fo?o$/).length).toEqual(Interval.of(2, 3));
    expect(Pattern.parse(/^mo{2}$/).length).toEqual(Interval.of(3, 3));
    expect(Pattern.parse(/^mo{2,}$/).length).toEqual(Interval.of(3, Infinity));
    expect(Pattern.parse(/^mo{2,7}$/).length).toEqual(Interval.of(3, 8));
    expect(Pattern.parse(/^s?e?q?u?e?n?c?e?$/).length).toEqual(
      Interval.of(0, 8),
    );
    expect(Pattern.parse(/^[A-Z]{6}$/).length).toEqual(Interval.of(6));
    expect(Pattern.parse(/^[aeiou].t$/).length).toEqual(Interval.of(3));
  });

  test("prefixes", () => {
    expect(Pattern.parse(/^test$/).prefixes(Interval.of(2)).source).toBe(
      "^te$",
    );
    expect(Pattern.parse(/^test$/).prefixes(Interval.of(2, 4)).source).toBe(
      "^tes?t?$",
    );
    expect(Pattern.parse(/^test$/).prefixes(Interval.of(0, 10)).source).toBe(
      "^t?e?s?t?$",
    );
    expect(Pattern.parse(/^t?est$/).prefixes(Interval.of(2)).source).toBe(
      "^[te][es]$",
    );
    expect(Pattern.parse(/^mo+$/).prefixes(Interval.of(1, 3)).source).toBe(
      "^mo?o?$",
    );
    expect(Pattern.parse(/^(b|[^b])c$/).prefixes(Interval.of(1)).source).toBe(
      "^.$",
    );
    expect(
      Pattern.parse(/^abc$/).prefixes(Interval.of(2, Infinity)).source,
    ).toBe("^ab.*$");
  });

  test("reverse", () => {
    expect(Pattern.parse(/^abc$/).reverse().source).toBe("^cba$");
    expect(Pattern.parse(/^ab.*c$/).reverse().source).toBe("^c.*ba$");
    expect(Pattern.parse(/^a(bc){2}d$/).reverse().source).toBe("^d(cb){2}a$");
    expect(Pattern.parse(/^(ab|cd)e$/).reverse().source).toBe("^e(ba|dc)$");
    expect(Pattern.parse(/^[A-Z].t$/).reverse().source).toBe("^t.[A-Z]$");
  });

  test("case-insensitive", () => {
    expect(Pattern.parse(/^cat$/).test("CAT")).toBe(true);
    expect(Pattern.parse(/^CAT$/).test("cat")).toBe(true);
  });

  test("length to pattern", () => {
    expect(Pattern.length(Interval.of(5)).source).toBe("^.{5}$");
    expect(Pattern.length(Interval.of(5, 8)).source).toBe("^.{5,8}$");
    expect(Pattern.length(Interval.of(5, Infinity)).source).toBe("^.{5,}$");
    expect(Pattern.length(Interval.of(5, 3)).source).toBe("^.{5}$");
  });

  test("oneLook", () => {
    expect(Pattern.parse(/^.{5}$/).oneLook).toBe("?????");
    expect(Pattern.parse(/^a.[bc]d.$/).oneLook).toBe("a??d?");
    expect(Pattern.parse(/^A..$/).oneLook).toBe("a??");
    expect(Pattern.parse(/^.{2,4}$/).oneLook).toBe("??*");
    expect(Pattern.parse(/^.{2,}$/).oneLook).toBe("??*");
  });

  test("allows", () => {
    const pattern = Pattern.parse(/^a[bc].*$/);
    expect(pattern.allows(0, "a")).toBe(true);
    expect(pattern.allows(0, "A")).toBe(true);
    expect(pattern.allows(0, "b")).toBe(false);
    expect(pattern.allows(1, "c")).toBe(true);
    expect(pattern.allows(1, "d")).toBe(false);
    expect(pattern.allows(5, "z")).toBe(true);
    expect(Pattern.parse(/^ab$/).allows(2, "a")).toBe(false);
  });

  test("never", () => {
    const never = Pattern.never;
    expect(never.length.isEmpty()).toBe(true);
    expect(never.test("")).toBe(false);
    expect(never.allows(0, "a")).toBe(false);
    expect(never.reverse().length.isEmpty()).toBe(true);
    expect(never.prefixes(Interval.of(1, 3)).length.isEmpty()).toBe(true);
    expect(
      Pattern.parse(/^abc$/).prefixes(Interval.empty).length.isEmpty(),
    ).toBe(true);
  });

  test("meet", () => {
    const fourCat = Pattern.parse(/^.cat$/);

    // Exact when either side is any.
    expect(Pattern.any.meet(fourCat)).toBe(fourCat);
    expect(fourCat.meet(Pattern.any)).toBe(fourCat);
    expect(Pattern.parse(/^.{4}$/).meet(fourCat).source).toBe("^.CAT$");
    expect(
      Pattern.parse(/^[ab].{2,3}$/).meet(Pattern.parse(/^.b.*$/)).source,
    ).toBe("^[AB]B..?$");
    expect(
      Pattern.parse(/^a.$/).meet(Pattern.parse(/^b.$/)).length.isEmpty(),
    ).toBe(true);
    expect(
      Pattern.parse(/^.{2}$/)
        .meet(Pattern.parse(/^.{3}$/))
        .length.isEmpty(),
    ).toBe(true);

    // Approximate.
    const meet = Pattern.parse(/^(ab|ba)$/).meet(Pattern.parse(/^(aa|bb)$/));
    expect(meet.test("ab")).toBe(true);
  });

  test("JSON", () => {
    for (const pattern of [
      Pattern.parse(/^.cat$/),
      Pattern.parse(/^[ab]x?.*$/),
      Pattern.any,
      Pattern.never,
    ]) {
      const json = JSON.parse(JSON.stringify(pattern)) as string;
      expect(json).toBe(pattern.source);
      const parsed = Pattern.fromJSON(json);
      expect(parsed.source).toBe(pattern.source);
      expect(parsed.length).toEqual(pattern.length);
    }
  });
});
