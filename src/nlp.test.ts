import { describe, expect, test } from "vitest";
import { inflect, uninflect } from "./nlp.js";

describe("nlp", () => {
  test("uninflect", () => {
    expect(uninflect("birds")).toEqual({ inflection: "plural", base: "bird" });
    expect(uninflect("Gut parasites")).toEqual({
      inflection: "plural",
      base: "gut parasite",
    });
    expect(uninflect("threatened")).toEqual({
      inflection: "past",
      base: "threaten",
    });
    expect(uninflect("running")).toEqual({ inflection: "gerund", base: "run" });
    expect(uninflect("bigger")).toEqual({
      inflection: "comparative",
      base: "big",
    });
    expect(uninflect("sleepiest")).toEqual({
      inflection: "superlative",
      base: "sleepy",
    });
    expect(uninflect("Escort")).toBeNull();
    expect(uninflect("red")).toBeNull();
  });

  test("inflect", () => {
    expect(inflect("falcon", "plural")).toEqual(["falcons"]);
    expect(inflect("child", "plural")).toEqual(["children"]);
    expect(inflect("threaten", "plural")).toEqual(["threatens"]);
    expect(inflect("oil slick", "plural")).toEqual(["oil slicks"]);
    expect(inflect("threaten", "past")).toEqual(["threatened"]);
    expect(inflect("run", "gerund")).toEqual(["running"]);
    expect(inflect("sleepy", "superlative")).toEqual(["sleepiest"]);
  });
});
