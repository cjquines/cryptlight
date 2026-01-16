import * as fs from "node:fs/promises";
import * as path from "node:path";
import { IndicatorMatcher, IndicatorType } from "../src/indicators.js";
import { lemmatize } from "../src/nlp.js";
import {
  dataDir,
  distOutputDir,
  parseCSV,
  parseTSV,
  srcOutputDir,
} from "./util.js";

type IndicatorData = {
  lemmas: string[];
  type: IndicatorType;
  score: number;
};

const collator = Intl.Collator("en", { sensitivity: "base" });

async function main() {
  const indicatorData: IndicatorData[] = [];

  // manual
  for await (const record of parseTSV<{ text: string; type: string }>(
    path.join("manual", "anagram.tsv"),
  )) {
    const lemmas = lemmatize(record.text).map((l) => l.lemma);
    const type = IndicatorType.Anagram;
    const score = record.type === "Standard" ? 50 : 20;
    indicatorData.push({ lemmas, type, score });
  }
  for await (const record of parseTSV<{
    text: string;
    other: string;
    variety: string;
    type: string;
  }>(path.join("manual", "container.tsv"))) {
    const lemmas = lemmatize(record.text).map((l) => l.lemma);
    const type =
      record.variety === "Insertion"
        ? IndicatorType.Insertion
        : record.variety === "Containment"
          ? IndicatorType.Container
          : IndicatorType.Containment;
    const score = record.type === "Standard" ? 50 : 20;
    indicatorData.push({ lemmas, type, score });
    for (const other of record.other.split("/")) {
      if (!other) continue;
      const otherLemmas = lemmatize(other).map((l) => l.lemma);
      if (otherLemmas.every((l, i) => l === lemmas[i])) {
        continue;
      }
      indicatorData.push({ lemmas: otherLemmas, type, score });
    }
  }
  for await (const record of parseTSV<{
    text: string;
    other: string;
    variety: string;
    type: string;
  }>(path.join("manual", "deletion.tsv"))) {
    const lemmas = lemmatize(record.text).map((l) => l.lemma);
    const type =
      record.variety === "Expulsion"
        ? IndicatorType.Expulsion
        : record.variety === "Departure"
          ? IndicatorType.Departure
          : record.variety.includes("Reduction - last letter")
            ? IndicatorType.Curtailing
            : record.variety.includes("Reduction - first letter")
              ? IndicatorType.Beheading
              : record.variety.includes("Reduction - middle letter")
                ? IndicatorType.Emptying
                : record.variety.includes("Reduction - both end")
                  ? IndicatorType.Trimming
                  : IndicatorType.Deletion;
    const score = record.type === "Standard" ? 50 : 20;
    indicatorData.push({ lemmas, type, score });
    for (const other of record.other.split("/")) {
      if (!other) continue;
      const otherLemmas = lemmatize(other).map((l) => l.lemma);
      if (otherLemmas.every((l, i) => l === lemmas[i])) {
        continue;
      }
      indicatorData.push({ lemmas: otherLemmas, type, score });
    }
  }
  for await (const record of parseTSV<{
    text: string;
    other: string;
    type: string;
  }>(path.join("manual", "hidden.tsv"))) {
    const lemmas = lemmatize(record.text).map((l) => l.lemma);
    const type = IndicatorType.Hidden;
    const score = record.type === "Standard" ? 50 : 20;
    indicatorData.push({ lemmas, type, score });
    for (const other of record.other.split("/")) {
      if (!other) continue;
      const otherLemmas = lemmatize(other).map((l) => l.lemma);
      if (otherLemmas.every((l, i) => l === lemmas[i])) {
        continue;
      }
      indicatorData.push({ lemmas: otherLemmas, type, score });
    }
  }
  for await (const record of parseTSV<{
    text: string;
    other: string;
    type: string;
  }>(path.join("manual", "homophone.tsv"))) {
    const lemmas = lemmatize(record.text).map((l) => l.lemma);
    const type = IndicatorType.Homophone;
    const score = record.type === "Standard" ? 50 : 20;
    indicatorData.push({ lemmas, type, score });
    for (const other of record.other.split("/")) {
      if (!other) continue;
      const otherLemmas = lemmatize(other).map((l) => l.lemma);
      if (otherLemmas.every((l, i) => l === lemmas[i])) {
        continue;
      }
      indicatorData.push({ lemmas: otherLemmas, type, score });
    }
  }
  for await (const record of parseTSV<{
    text: string;
    other: string;
    direction: string;
    type: string;
  }>(path.join("manual", "reversal.tsv"))) {
    const lemmas = lemmatize(record.text).map((l) => l.lemma);
    const type = IndicatorType.Reversal;
    const score = record.type === "Standard" ? 50 : 20;
    indicatorData.push({ lemmas, type, score });
    for (const other of record.other.split("/")) {
      if (!other) continue;
      const otherLemmas = lemmatize(other).map((l) => l.lemma);
      if (otherLemmas.every((l, i) => l === lemmas[i])) {
        continue;
      }
      indicatorData.push({ lemmas: otherLemmas, type, score });
    }
  }
  for await (const record of parseTSV<{
    text: string;
    selection: string;
    example: string;
    type: string;
  }>(path.join("manual", "selection.tsv"))) {
    const lemmas = lemmatize(record.text).map((l) => l.lemma);
    const type = record.selection.includes("First letter")
      ? IndicatorType.Prefix
      : record.selection.includes("Last letter")
        ? IndicatorType.Suffix
        : record.selection.includes("Middle letter")
          ? IndicatorType.Centers
          : record.selection.includes("First and last")
            ? IndicatorType.Ends
            : IndicatorType.Selection;
    const score = record.type === "Standard" ? 50 : 20;
    indicatorData.push({ lemmas, type, score });
    for (const other of record.selection.split("/")) {
      if (!other) continue;
      const otherLemmas = lemmatize(other).map((l) => l.lemma);
      if (otherLemmas.every((l, i) => l === lemmas[i])) {
        continue;
      }
      indicatorData.push({ lemmas: otherLemmas, type, score });
    }
  }

  // georgeho
  for await (const { wordplay, indicator, clue_rowids } of parseCSV<{
    rowid: string;
    wordplay:
      | "alternation"
      | "anagram"
      | "container"
      | "deletion"
      | "hidden"
      | "homophone"
      | "insertion"
      | "reversal";
    indicator: string;
    clue_rowids: string;
  }>("georgeho-indicators.csv")) {
    indicatorData.push({
      lemmas: lemmatize(indicator).map((l) => l.lemma),
      type: wordplay,
      score: Array.from(clue_rowids.matchAll(/,/g)).length + 1,
    });
  }

  // rdeits
  for (const [file, type] of [
    ["ana_", IndicatorType.Anagram],
    ["ins_", IndicatorType.Containment],
    ["rev_", IndicatorType.Reversal],
  ] as const) {
    const filePath = path.join(dataDir, "rdeits", file);
    const lines = (await fs.readFile(filePath, "utf-8")).split("\n");
    for (const line of lines) {
      const phrase = line.replaceAll("_", " ");
      if (!phrase) continue;
      indicatorData.push({
        lemmas: lemmatize(phrase).map((l) => l.lemma),
        type,
        score: 20,
      });
    }
  }

  indicatorData.sort((a, b) =>
    collator.compare(a.lemmas.join(" "), b.lemmas.join(" ")),
  );

  const indicators = new IndicatorMatcher();

  for (const { lemmas, type, score } of indicatorData) {
    indicators.insert(lemmas, type, score);
  }

  for (const dir of [srcOutputDir, distOutputDir]) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "indicators.txt"),
      indicators.dump().join("\n"),
      "utf-8",
    );
  }
}

await main();
