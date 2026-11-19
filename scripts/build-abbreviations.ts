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

  // manual
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

  // clueclinic
  const clueClinic = new Map<string, AbbreviationData>();
  for (const file of ["abbreviations.csv", "single-letter-markers.csv"]) {
    for await (const record of parseCSV<{
      phrase: string;
      standard: string;
      abbreviation: string;
    }>(path.join("clueclinic", file))) {
      const lemma = abbreviationKey(record.phrase);
      if (lemma === undefined) continue;
      const abbreviation = slugify(record.abbreviation).toUpperCase();
      // TODO: calibrate weights
      const score = record.standard === "true" ? 50 : 20;
      const key = `${lemma}\t${abbreviation}`;
      const existing = clueClinic.get(key);
      if (existing === undefined || existing.score < score) {
        clueClinic.set(key, { lemma, abbreviation, score });
      }
    }
  }
  abbreviationData.push(...clueClinic.values());

  // georgeho
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
