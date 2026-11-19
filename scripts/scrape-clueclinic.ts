import * as fs from "node:fs/promises";
import * as path from "node:path";

import { dataDir } from "./util.js";

type TableSpec = {
  phrases: number[];
  isStandard: number;
  keep?: Record<string, number>;
  merge?: { name: string; columns: number[] };
};

type List = { file: string; slugs: string[]; spec?: TableSpec };

const LISTS: List[] = [
  {
    file: "abbreviations",
    slugs: ["all-abbreviations"],
    spec: {
      phrases: [0],
      isStandard: 4,
      merge: { name: "abbreviation", columns: [1, 2, 3] },
    },
  },
  {
    file: "anagram",
    slugs: ["anagram-indicators"],
    spec: { phrases: [0], isStandard: 2 },
  },
  {
    file: "container",
    slugs: ["container-contents-indicators"],
    spec: { phrases: [0, 1], isStandard: 3, keep: { variety: 2 } },
  },
  {
    file: "deletion",
    slugs: ["deletion-indicators"],
    spec: { phrases: [0, 1], isStandard: 4, keep: { variety: 3 } },
  },
  {
    file: "drag-and-drop",
    slugs: ["drag-and-drop-indicators"],
    spec: { phrases: [0, 1], isStandard: 4, keep: { effect: 3 } },
  },
  {
    file: "hidden",
    slugs: ["hidden-indicators"],
    spec: { phrases: [0, 1], isStandard: 2 },
  },
  {
    file: "homophone",
    slugs: ["homophone-indicators"],
    spec: { phrases: [0, 1], isStandard: 2 },
  },
  {
    file: "intermittent",
    slugs: ["intermittent-indicators"],
    spec: { phrases: [0, 1], isStandard: 3, keep: { selection: 2 } },
  },
  {
    file: "letter-selection",
    slugs: ["letter-selection-indicators"],
    spec: { phrases: [0], isStandard: 3, keep: { selection: 1 } },
  },
  {
    file: "replacement",
    slugs: ["replacement-indicators"],
    spec: { phrases: [0, 2], isStandard: 3 },
  },
  {
    file: "reversal",
    slugs: ["reversal-indicators"],
    spec: { phrases: [0, 1], isStandard: 3 },
  },
  {
    file: "single-letter-markers",
    slugs: [
      "single-letter-markers-in-barred-puzzles",
      "single-letter-markers-in-blocked-puzzles",
    ],
    spec: { phrases: [1, 2, 3], isStandard: 4, keep: { abbreviation: 0 } },
  },
  // TODO: use these maybe
  ...[
    "common-abbreviations",
    "cryptic-lexicon",
    "juxtaposition-indicators",
    "link-expressions",
    "whimsical-indicators",
  ].map((slug) => ({ file: slug, slugs: [slug] })),
];

const outDir = path.join(dataDir, "clueclinic");

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (match, body: string) => {
      if (body.startsWith("#")) {
        const code =
          body[1] === "x" || body[1] === "X"
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        return String.fromCodePoint(code);
      }
      const named = NAMED_ENTITIES[body.toLowerCase()];
      if (named === undefined) {
        throw new Error(`unknown entity ${match}`);
      }
      return named;
    },
  );
}

function cellText(html: string): string {
  return decodeEntities(
    html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
  ).trim();
}

function parseTable(html: string): string[][] {
  const tables = html.match(/<table[^>]*class="tablepress[\s\S]*?<\/table>/g);
  if (tables?.length !== 1) {
    throw new Error(`expected 1 table, found ${tables?.length ?? 0}`);
  }
  const rows = tables[0].match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  return rows.map((row) =>
    [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) =>
      cellText(m[1]!),
    ),
  );
}

const PREPOSITIONS = new Set(["for", "from", "in", "of", "off", "on", "to"]);

/**
 * "head(s)" -> "head", "heads"
 * "chucking (out)" -> "chucking", "chucking out"
 * "back from/of/off" -> "back from", "back of", "back off"
 * "leaves/left by" -> "leaves", "left by"
 */
function expandVariants(text: string): string[] {
  text = text.trim();
  if (!text || text.includes("…")) return [];

  const paren = /^(.*?)( ?)\(([^)]+)\)(.*)$/.exec(text);
  if (paren) {
    const [, before, space, inside, after] = paren as unknown as string[];
    return [
      ...expandVariants(`${before}${after}`),
      ...expandVariants(`${before}${space}${inside}${after}`),
    ];
  }

  const [first, ...rest] = text.split("/").map((p) => p.trim());
  if (rest.length === 0) return [first!];
  const firstWords = first!.split(" ");
  if (
    firstWords.length > 1 &&
    PREPOSITIONS.has(firstWords.at(-1)!) &&
    rest.every((p) => PREPOSITIONS.has(p))
  ) {
    const stem = firstWords.slice(0, -1).join(" ");
    return [first!, ...rest.map((p) => `${stem} ${p}`)];
  }
  return [first!, ...rest];
}

function cellPhrases(cell: string): string[] {
  return cell
    .split(",")
    .flatMap(expandVariants)
    .map((p) => p.replace(/^x /, "")); // "x promoted"
}

function isStandard(cell: string): boolean {
  const value = cell.trim();
  if (["Standard", "Standrad", "All", "A"].includes(value)) return true;
  if (["Advanced", "Some", "B"].includes(value)) return false;
  throw new Error(`unknown validity ${JSON.stringify(value)}`);
}

function normalize(rows: string[][], spec: TableSpec): string[][] {
  const keep = Object.entries(spec.keep ?? {});
  const header = [
    "phrase",
    "standard",
    ...keep.map(([name]) => name),
    ...(spec.merge ? [spec.merge.name] : []),
  ];
  const res = new Map<string, string[]>();
  for (const row of rows) {
    const standard = isStandard(row[spec.isStandard]!);
    const kept = keep.map(([, i]) => row[i]!);
    const merged = spec.merge
      ? spec.merge.columns.map((i) => row[i]!.trim()).filter(Boolean)
      : [undefined];
    for (const phrase of spec.phrases.flatMap((i) => cellPhrases(row[i]!))) {
      for (const value of merged) {
        const rest = value === undefined ? kept : [...kept, value];
        const key = [phrase, ...rest].join("\t");
        if (res.get(key)?.[1] === "true") continue;
        res.set(key, [phrase, String(standard), ...rest]);
      }
    }
  }
  return [header, ...res.values()];
}

function toCSV(rows: string[][]): string {
  const quote = (cell: string) =>
    /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  return rows.map((row) => row.map(quote).join(",")).join("\n") + "\n";
}

async function scrape(slug: string): Promise<string[][]> {
  const res = await fetch(`https://www.clueclinic.com/index.php/${slug}/`);
  if (!res.ok) {
    throw new Error(`${slug}: HTTP ${res.status}`);
  }
  const rows = parseTable(await res.text());
  const width = rows[0]!.length;
  const ragged = rows.findIndex((row) => row.length !== width);
  if (ragged !== -1) {
    throw new Error(`${slug}: row ${ragged} has ${rows[ragged]!.length} cells`);
  }
  return rows;
}

await fs.mkdir(outDir, { recursive: true });
for (const { file, slugs, spec } of LISTS) {
  const tables = [];
  for (const slug of slugs) {
    tables.push(await scrape(slug));
  }
  const rows = spec
    ? normalize(
        tables.flatMap((table) => table.slice(1)),
        spec,
      )
    : tables[0]!;
  await fs.writeFile(path.join(outDir, `${file}.csv`), toCSV(rows));
  console.log(
    `${file}: ${rows.length - 1} rows, columns ${rows[0]!.join(" | ")}`,
  );
}
