import {
  build,
  type DerivationData,
  downloadIndicators,
  downloadWordsetData,
  IndicatorMatcher,
  type IndicatorMatch,
  type Node,
  type NodeId,
  type Plan,
  planToJSON,
  type PlanData,
  type WordDerivation,
  Wordset,
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
  | { type: "abort"; inputID: number }
  | { type: "wordset:plan"; requestID: number; root: Node }
  | {
      type: "wordset:run";
      requestID: number;
      root: Node;
      /** Run only this node, with the args the root's plan gives it. */
      target?: NodeId;
      limit: number;
    }
  | { type: "wordset:more"; requestID: number; limit: number }
  | { type: "wordset:abort"; requestID: number };

export type WorkerOutput =
  | { type: "ready"; what: "indicators" | "wordset" }
  | { type: "error"; error: string }
  | { type: "output:indicators"; inputID: number; chunk: IndicatorMatch[][] }
  | { type: "output:end"; inputID: number }
  | { type: "wordset:plan"; requestID: number; plan: PlanData }
  | {
      type: "wordset:results";
      requestID: number;
      results: DerivationData[];
      /**
       * "running": more results for this page are coming. "paused": the page
       * is full; send "wordset:more" for more. "done": there are no more.
       */
      status: "running" | "paused" | "done";
    }
  | { type: "wordset:error"; requestID: number; error: string };

const send = (message: WorkerOutput) => {
  self.postMessage(message);
};

self.addEventListener("message", ({ data }: { data: WorkerInput }) => {
  switch (data.type) {
    case "download":
      download();
      return;
    case "input:indicators":
      matchIndicators(data.inputID, data.lemmas);
      return;
    case "abort":
      abortIndicators(data.inputID);
      return;
    case "wordset:plan":
      planWordset(data.requestID, data.root);
      return;
    case "wordset:run":
      runWordset(data.requestID, data.root, data.target, data.limit);
      return;
    case "wordset:more":
      moreWordset(data.requestID, data.limit);
      return;
    case "wordset:abort":
      abortWordset(data.requestID);
      return;
    default:
      data satisfies never;
  }
});

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function download() {
  void downloadIndicators().then((lines) => {
    matcher = new IndicatorMatcher();
    matcher.parse(lines);
    send({ type: "ready", what: "indicators" });
  });
  void downloadWordsetData().then((data) => {
    Wordset.load(data);
    wordsetReady = true;
    send({ type: "ready", what: "wordset" });
  });
}

// indicators:

let matcher: IndicatorMatcher | null = null;
let inputID: number | null = null;
let outputGenerators: (Generator<IndicatorMatch> | null)[] | null = null;

function abortIndicators(abortID: number) {
  if (abortID === inputID) {
    send({ type: "output:end", inputID: abortID });
    inputID = null;
    outputGenerators = null;
  }
}

function matchIndicators(newInputID: number, lemmas: string[][]) {
  if (!matcher) {
    send({ type: "error", error: "Indicators not ready" });
    return;
  }

  if (inputID !== null && inputID <= newInputID) {
    return;
  }

  inputID = newInputID;
  outputGenerators = lemmas.map((line) => matcher!.match(line));

  const sendChunk = () => {
    if (inputID === null || outputGenerators === null) return;

    const start = Date.now();
    const chunk: IndicatorMatch[][] = Array.from({ length: lemmas.length })
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
}

// wordsets:

let wordsetReady = false;

type Request = {
  iterator: AsyncIterator<WordDerivation>;
  controller: AbortController;
  /** How many more results to send before pausing. */
  remaining: number;
  running: boolean;
};

const requests = new Map<number, Request>();

function wordsetError(requestID: number, error: unknown) {
  send({ type: "wordset:error", requestID, error: errorMessage(error) });
}

function planWordset(requestID: number, root: Node) {
  try {
    send({
      type: "wordset:plan",
      requestID,
      plan: planToJSON(build(root).plan()),
    });
  } catch (error) {
    wordsetError(requestID, error);
  }
}

/** The outermost plan of a wordset built from node `id`, if any. */
function findPlan(plan: Plan, id: NodeId): Plan | null {
  if (plan.node.id === id) {
    return plan;
  }
  for (const child of plan.children) {
    const found = findPlan(child, id);
    if (found) {
      return found;
    }
  }
  return null;
}

function runWordset(
  requestID: number,
  root: Node,
  target: NodeId | undefined,
  limit: number,
) {
  if (!wordsetReady) {
    wordsetError(requestID, "Wordset not ready");
    return;
  }

  const controller = new AbortController();
  let results: AsyncIterable<WordDerivation>;
  try {
    const wordset = build(root);
    if (target === undefined) {
      results = wordset.run(undefined, undefined, {
        signal: controller.signal,
      });
    } else {
      const plan = findPlan(wordset.plan(), target);
      if (plan === null) {
        throw new Error(
          `node ${target} isn't run: it's disabled, or it or an ancestor is pinned`,
        );
      }
      results = plan.node.run(plan.args.pattern, plan.args.candidates, {
        signal: controller.signal,
      });
    }
  } catch (error) {
    wordsetError(requestID, error);
    return;
  }

  requests.set(requestID, {
    iterator: results[Symbol.asyncIterator](),
    controller,
    remaining: limit,
    running: false,
  });
  void runRequest(requestID);
}

function moreWordset(requestID: number, limit: number) {
  const request = requests.get(requestID);
  if (request) {
    request.remaining += limit;
    void runRequest(requestID);
  }
}

function abortWordset(requestID: number) {
  const request = requests.get(requestID);
  if (request) {
    request.controller.abort();
    requests.delete(requestID);
  }
}

/** Send results until the request's page is full, in chunks. */
async function runRequest(requestID: number) {
  const request = requests.get(requestID);
  if (!request || request.running) {
    return;
  }
  request.running = true;

  let chunk: DerivationData[] = [];
  let lastSent = Date.now();
  try {
    while (request.remaining > 0) {
      const next = await request.iterator.next();
      if (request.controller.signal.aborted) {
        return;
      }
      if (next.done) {
        send({
          type: "wordset:results",
          requestID,
          results: chunk,
          status: "done",
        });
        requests.delete(requestID);
        return;
      }
      chunk.push(next.value.toJSON());
      request.remaining--;
      if (Date.now() - lastSent >= MIN_CHUNK_MS && request.remaining > 0) {
        send({
          type: "wordset:results",
          requestID,
          results: chunk,
          status: "running",
        });
        chunk = [];
        lastSent = Date.now();
      }
    }
    send({
      type: "wordset:results",
      requestID,
      results: chunk,
      status: "paused",
    });
  } catch (error) {
    if (!request.controller.signal.aborted) {
      wordsetError(requestID, error);
      requests.delete(requestID);
    }
  } finally {
    request.running = false;
  }
}
