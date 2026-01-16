import {
  downloadIndicators,
  IndicatorMatcher,
  type IndicatorMatch,
} from "cryptlight";

/** Minimum time to wait between chunks, in milliseconds. */
const MIN_CHUNK_MS = 100;

export type WorkerInput =
  | { type: "download" }
  | {
      type: "input:indicators";
      inputID: number;
      lemmas: string[][];
    }
  | { type: "abort"; inputID: number };

export type WorkerOutput =
  | { type: "ready" }
  | { type: "error"; error: string }
  | { type: "output:indicators"; inputID: number; chunk: IndicatorMatch[][] }
  | { type: "output:end"; inputID: number };

const send = (message: WorkerOutput) => {
  self.postMessage(message);
};

let matcher: IndicatorMatcher | null = null;
let inputID: number | null = null;
let outputGenerators: (Generator<IndicatorMatch> | null)[] | null = null;

self.addEventListener("message", ({ data }: { data: WorkerInput }) => {
  if (data.type === "download") {
    void downloadIndicators().then((lines) => {
      matcher = new IndicatorMatcher();
      matcher.parse(lines);
      send({ type: "ready" });
    });
    return;
  }

  if (!matcher) {
    send({ type: "error", error: "Worker not ready" });
    return;
  }

  if (data.type === "abort") {
    if (data.inputID === inputID) {
      send({ type: "output:end", inputID: data.inputID });
      inputID = null;
      outputGenerators = null;
    }
    return;
  }

  data.type satisfies "input:indicators";

  if (inputID !== null && inputID <= data.inputID) {
    return;
  }

  inputID = data.inputID;
  outputGenerators = data.lemmas.map((line) => matcher!.match(line));

  const sendChunk = () => {
    if (inputID === null || outputGenerators === null) return;

    const start = Date.now();
    const chunk: IndicatorMatch[][] = Array.from({ length: data.lemmas.length })
      .fill(null)
      .map(() => []);
    while (Date.now() - start <= MIN_CHUNK_MS) {
      for (let i = 0; i < outputGenerators.length; i++) {
        const iter = outputGenerators[i];
        if (iter === null) continue;
        const indicator = iter.next();
        if (indicator.done) {
          outputGenerators[i] = null;
          break;
        }
        chunk[i].push(indicator.value);
      }
    }

    if (chunk.some((chunk) => chunk.length > 0)) {
      send({ type: "output:indicators", inputID, chunk });
    }
    if (outputGenerators.every((iter) => iter === null)) {
      send({ type: "output:end", inputID });
      inputID = null;
      outputGenerators = null;
      return;
    }

    setTimeout(sendChunk, 0);
  };

  sendChunk();
});
