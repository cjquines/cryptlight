import * as fs from "node:fs/promises";
import * as path from "node:path";
import { IndicatorMatcher, IndicatorType as Ind } from "../src/indicators.js";
import { lemmatize } from "../src/nlp.js";
import { dataDir, distOutputDir, parseCSV, srcOutputDir } from "./util.js";

type IndicatorData = {
  lemmas: string[];
  type: Ind;
  score: number;
};

type ClueClinicRow = {
  phrase: string;
  standard: string;
  variety?: string;
  effect?: string;
  selection?: string;
};

const collator = Intl.Collator("en", { sensitivity: "base" });

async function main() {
  const indicatorData: IndicatorData[] = [];

  // clueclinic
  const clueClinic = new Map<string, IndicatorData>();
  const addClueClinic = async (
    file: string,
    typeOf: (record: ClueClinicRow) => Ind,
  ) => {
    for await (const record of parseCSV<ClueClinicRow>(
      path.join("clueclinic", file),
    )) {
      const lemmas = lemmatize(record.phrase).map((l) => l.lemma);
      const type = typeOf(record);
      // TODO: calibrate weights
      const score = record.standard === "true" ? 50 : 20;
      const key = `${lemmas.join(" ")}\t${type}`;
      const existing = clueClinic.get(key);
      if (existing === undefined || existing.score < score) {
        clueClinic.set(key, { lemmas, type, score });
      }
    }
  };

  await addClueClinic("anagram.csv", () => Ind.Anagram);
  await addClueClinic("container.csv", ({ variety = "" }) =>
    variety === "Insertion"
      ? Ind.Insertion
      : variety === "Containment"
        ? Ind.Container
        : Ind.Containment,
  );
  await addClueClinic("deletion.csv", ({ variety = "" }) =>
    variety === "Expulsion"
      ? Ind.Expulsion
      : variety === "Departure"
        ? Ind.Departure
        : variety.includes("last letter")
          ? Ind.Curtailing
          : variety.includes("first letter")
            ? Ind.Beheading
            : variety.includes("middle") || variety.includes("central")
              ? Ind.Emptying
              : variety.includes("both ends")
                ? Ind.Trimming
                : Ind.Deletion,
  );
  await addClueClinic("drag-and-drop.csv", ({ effect = "" }) =>
    /exchanged|swapped/.test(effect) ? Ind.Exchange : Ind.Rotation,
  );
  await addClueClinic("hidden.csv", () => Ind.Hidden);
  await addClueClinic("homophone.csv", () => Ind.Homophone);
  await addClueClinic("intermittent.csv", ({ selection = "" }) =>
    selection.includes("odd")
      ? Ind.Oddly
      : selection.includes("even")
        ? Ind.Evenly
        : Ind.Alternation,
  );
  await addClueClinic("letter-selection.csv", ({ selection = "" }) =>
    selection === "First and last letters"
      ? Ind.Ends
      : selection.startsWith("First letter") ||
          selection === "First two letters"
        ? Ind.Prefix
        : selection === "Last letter"
          ? Ind.Suffix
          : selection.startsWith("Middle letter")
            ? Ind.Centers
            : Ind.Selection,
  );
  await addClueClinic("replacement.csv", () => Ind.Substitution);
  await addClueClinic("reversal.csv", () => Ind.Reversal);
  indicatorData.push(...clueClinic.values());

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
    ["ana_", Ind.Anagram],
    ["ins_", Ind.Containment],
    ["rev_", Ind.Reversal],
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
