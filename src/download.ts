import { loadWordlist } from "cromulence";
import type { WordsetData } from "./wordset.js";

export async function downloadIndicators(): Promise<string[]> {
  const resp = await fetch(
    `https://cdn.jsdelivr.net/npm/cryptlight@0.1.1/dist/data/indicators.txt`,
  );
  return (await resp.text()).split("\n");
}

export async function downloadWordsetData(): Promise<WordsetData> {
  return {
    wordlist: await loadWordlist(),
  };
}
