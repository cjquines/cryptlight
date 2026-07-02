import { loadWordlist } from "cromulence";
import type { WordsetData } from "./wordset.js";

async function readLines(name: string): Promise<string[]> {
  const resp = await fetch(
    `https://cdn.jsdelivr.net/npm/cryptlight@0.1.1/dist/data/${name}`,
  );
  return (await resp.text()).split("\n");
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
