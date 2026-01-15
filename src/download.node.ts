import { loadWordlist } from "cromulence";
import type { WordsetData } from "./wordset.js";

export async function downloadIndicators(): Promise<string[]> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const url = await import("node:url");
  const filePath = path.join(
    path.dirname(url.fileURLToPath(import.meta.url)),
    "data",
    "indicators.txt",
  );
  return (await fs.readFile(filePath, "utf-8")).trim().split("\n");
}

export async function downloadWordsetData(): Promise<WordsetData> {
  return {
    wordlist: await loadWordlist(),
  };
}
