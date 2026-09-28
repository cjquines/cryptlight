import * as fs from "node:fs/promises";
import * as path from "node:path";
import { abbreviationKey, Abbreviations } from "../src/abbreviations.js";
import { distOutputDir, parseCSV, parseTSV, srcOutputDir } from "./util.js";
import { slugify } from "cromulence";

type AbbreviationData = {
  lemma: string;
  abbreviation: string;
  score: number;
};

const collator = Intl.Collator("en", { sensitivity: "base" });

async function main() {
  let abbreviationData: AbbreviationData[] = [];

  for await (const record of parseTSV<{
    text: string;
    abbr1: string;
    abbr2: string;
    abbr3: string;
  }>(path.join("manual", "abbreviation.tsv"))) {
    const lemma = abbreviationKey(record.text);
    if (lemma === undefined) continue;
    for (const abbr of [record.abbr1, record.abbr2, record.abbr3]) {
      if (!abbr) continue;
      abbreviationData.push({
        lemma,
        abbreviation: slugify(abbr).toUpperCase(),
        score: 50,
      });
    }
  }
  for await (const record of parseTSV<{
    text: string;
    other: string;
    letter: string;
    type: string;
  }>(path.join("manual", "abbreviation2.tsv"))) {
    const lemma = abbreviationKey(record.text);
    if (lemma === undefined) continue;
    abbreviationData.push({
      lemma,
      abbreviation: record.letter,
      score: record.type === "Standard" ? 50 : 20,
    });
    for (const other of record.other.split("/")) {
      if (!other) continue;
      const otherLemma = abbreviationKey(other);
      if (otherLemma === undefined || otherLemma === lemma) continue;
      abbreviationData.push({
        lemma: otherLemma,
        abbreviation: slugify(record.letter).toUpperCase(),
        score: record.type === "Standard" ? 50 : 20,
      });
    }
  }

  for await (const { charade, answer, clue_rowids } of parseCSV<{
    rowid: string;
    charade: string;
    answer: string;
    clue_rowids: string;
  }>("georgeho-charades.csv")) {
    const lemma = abbreviationKey(charade);
    if (lemma === undefined) continue;
    abbreviationData.push({
      lemma,
      abbreviation: slugify(answer).toUpperCase(),
      score: Array.from(clue_rowids.matchAll(/,/g)).length + 1,
    });
  }

  abbreviationData = abbreviationData
    .filter((a) => a.abbreviation.length <= 3)
    .sort((a, b) => collator.compare(a.lemma, b.lemma));

  const abbreviations = new Abbreviations();

  for (const { lemma, abbreviation, score } of abbreviationData) {
    abbreviations.insert(lemma, abbreviation, score);
  }

  for (const dir of [srcOutputDir, distOutputDir]) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "abbreviations.txt"),
      abbreviations.dump().join("\n"),
      "utf-8",
    );
  }
}

await main();
