import { loadWordlist } from "cromulence";
import type { WordsetData } from "./wordset.js";

async function readLines(name: string): Promise<string[]> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const url = await import("node:url");
  const filePath = path.join(
    path.dirname(url.fileURLToPath(import.meta.url)),
    "data",
    name,
  );
  return (await fs.readFile(filePath, "utf-8")).trim().split("\n");
}

export async function downloadIndicators(): Promise<string[]> {
  return readLines("indicators.txt");
}

export async function downloadWordsetData(): Promise<WordsetData> {
  return {
    abbreviations: await readLines("abbreviations.txt"),
    wordlist: await loadWordlist(),
  };
}
