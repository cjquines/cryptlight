import * as fs from "node:fs/promises";
import * as url from "node:url";
import { describe, expect, test } from "vitest";
import { Abbreviations } from "./abbreviations.js";

describe("Abbreviations", () => {
  const abbreviations = new Abbreviations();

  test("parse and match", async () => {
    const start = Date.now();
    const data = await fs.readFile(
      url.fileURLToPath(new URL("./data/abbreviations.txt", import.meta.url)),
      "utf-8",
    );
    abbreviations.parse(data.split("\n"));
    expect(Date.now() - start).toBeLessThan(1000);

    const matches = abbreviations.get("note");

    expect(matches).toContainEqual(
      expect.objectContaining({
        abbreviation: "DO",
      }),
    );
    expect(matches).toContainEqual(
      expect.objectContaining({
        abbreviation: "RE",
      }),
    );
    expect(matches).toContainEqual(
      expect.objectContaining({
        abbreviation: "MI",
      }),
    );
  });
});
