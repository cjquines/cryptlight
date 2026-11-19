import { loadWordlist } from "cromulence";
import type { WordsetData } from "./wordset.js";

async function readLines(name: string): Promise<string[]> {
  const resp = await fetch(new URL(`./data/${name}`, import.meta.url));
  if (!resp.ok) {
    throw new Error(`failed to load ${name}: ${resp.status}`);
  }
  return (await resp.text()).trim().split("\n");
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
