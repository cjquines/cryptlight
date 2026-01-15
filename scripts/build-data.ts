import * as csv from "csv-parse";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import { IndicatorMatcher, IndicatorType } from "../src/indicators.js";
import { lemmatize } from "../src/nlp.js";

const dataDir = url.fileURLToPath(new URL("./data", import.meta.url));
const srcOutputDir = url.fileURLToPath(new URL("../src/data", import.meta.url));
const distOutputDir = url.fileURLToPath(
  new URL("../dist/data", import.meta.url),
);

async function* parseCSV<T>(fileName: string): AsyncGenerator<T> {
  const stream = fs
    .createReadStream(path.join(dataDir, fileName))
    .pipe(csv.parse({ columns: true }));
  for await (const record of stream) {
    yield record;
  }
}

async function* parseTSV<T>(fileName: string): AsyncGenerator<T> {
  const lines = (
    await fs.promises.readFile(path.join(dataDir, fileName), "utf-8")
  )
    .trim()
    .split("\n");
  const header = lines.shift()!.split("\t");
  for (const line of lines) {
    const record = {} as T;
    const values = line.split("\t");
    for (let i = 0; i < header.length; i++) {
      record[header[i]! as keyof T] = values[i] as T[keyof T];
    }
    yield record;
  }
}

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
  // TODO: ...the rest...

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
    const lines = (await fs.promises.readFile(filePath, "utf-8")).split("\n");
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
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      path.join(dir, "indicators.txt"),
      indicators.dump().join("\n"),
      "utf-8",
    );
  }
}

await main();
