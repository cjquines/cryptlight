import * as csv from "csv-parse";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

export const dataDir = url.fileURLToPath(new URL("./data", import.meta.url));
export const srcOutputDir = url.fileURLToPath(
  new URL("../src/data", import.meta.url),
);
export const distOutputDir = url.fileURLToPath(
  new URL("../dist/data", import.meta.url),
);

export async function* parseCSV<T>(fileName: string): AsyncGenerator<T> {
  const stream = fs
    .createReadStream(path.join(dataDir, fileName))
    .pipe(csv.parse({ columns: true }));
  for await (const record of stream) {
    yield record;
  }
}

export async function* parseTSV<T>(fileName: string): AsyncGenerator<T> {
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
