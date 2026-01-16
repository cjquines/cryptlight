import { lemmatize, type IndicatorMatch } from "cryptlight";
import { create, type StateCreator } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { WorkerInput, WorkerOutput } from "./worker";
import CryptlightWorker from "./worker?worker";

const worker = new CryptlightWorker();
const send = (input: WorkerInput) => {
  worker.postMessage(input);
};

type State = {
  matcherInputID: number | null;
  lastMatcherInputID: number;
  matcherInput: string;

  lemmatizedMatcherInput: { text: string; lemma: string }[][];
  matcherOutputInputID: number;
  matcherOutput: IndicatorMatch[][];

  workerInited: boolean;
  workerReady: boolean;

  setMatcherInput: (value: string) => void;
  sendMatcherInput: () => void;
  initWorker: () => void;
};

const stateCreator: StateCreator<State> = (set, get) => ({
  matcherInputID: null,
  lastMatcherInputID: -1,
  matcherInput:
    "36. Firm deal closer rejects hot sushi accompaniment\n8. Announcer Hall initially emulates Dr. Demento",

  lemmatizedMatcherInput: [],
  matcherOutputInputID: -1,
  matcherOutput: [],

  workerInited: false,
  workerReady: false,

  setMatcherInput: (value) => {
    set({ matcherInput: value });
  },
  sendMatcherInput: () => {
    if (!get().workerReady) {
      return;
    }

    const lemmatized = get()
      .matcherInput.trim()
      .split("\n")
      .map((line) => lemmatize(line));

    const newInputID = get().lastMatcherInputID + 1;

    send({
      type: "input:indicators",
      inputID: newInputID,
      lemmas: lemmatized.map((line) => line.map((token) => token.lemma)),
    });
    set({
      lemmatizedMatcherInput: lemmatized,
      matcherInputID: newInputID,
      lastMatcherInputID: newInputID,
    });
  },
  initWorker: () => {
    if (get().workerInited) {
      return;
    }
    set({ workerInited: true });

    worker.addEventListener("message", ({ data }: { data: WorkerOutput }) => {
      if (data.type === "ready") {
        set({ workerReady: true });
        get().sendMatcherInput();
      } else if (data.type === "output:indicators") {
        if (data.inputID < get().matcherOutputInputID) {
          // old; ignore
        } else if (data.inputID === get().matcherOutputInputID) {
          // current; append
          set({
            matcherOutputInputID: data.inputID,
            matcherOutput: get().matcherOutput.map((line, i) =>
              line.concat(data.chunk[i]),
            ),
          });
        } else {
          // new; replace
          set({
            matcherOutputInputID: data.inputID,
            matcherOutput: data.chunk,
          });
        }
      } else if (data.type === "output:end") {
        if (data.inputID === get().matcherOutputInputID) {
          set({
            matcherInputID: null,
          });
        }
      } else {
        data.type satisfies "error";
        console.error("Worker error:", data.error);
      }
    });

    send({ type: "download" });
  },
});

export const useStore = create<State>()(
  // @ts-expect-error - mixed middlewares
  import.meta.env.PROD
    ? persist(stateCreator, {
        name: "cryptlight",
        partialize: () => ({}),
      })
    : devtools(
        persist(stateCreator, {
          name: "cryptlight",
          partialize: () => ({}),
        }),
      ),
);
