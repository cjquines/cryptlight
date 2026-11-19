import { Pattern } from "./pattern.js";
import { Interval } from "./util.js";
import { type Plan, Wordset } from "./wordset.js";

export type NodeId = string;

type UnaryOp =
  | "anagram"
  | "behead"
  | "centers"
  | "curtail"
  | "ends"
  | "homophone"
  | "moveLetter"
  | "prefix"
  | "reverse"
  | "rotate"
  | "spoonerism"
  | "substring"
  | "suffix"
  | "wordlike";

type BinaryOp =
  "concat" | "delete" | "deleteAll" | "insert" | "intersect" | "overlap";

type NodeBase = {
  id: NodeId;
  /** For one-child nodes. If set, passthrough only child. */
  disabled?: boolean;
  /** Replace subtree with these words. */
  pin?: string[];
  /** Drop these words from the results. */
  exclude?: string[];
};

/** A serializable description of a Wordset. See `build`. */
export type Node = NodeBase &
  (
    | { op: "literal" | "synonym"; text: string }
    | { op: "values"; words: string[] }
    | { op: "any"; length: [min: number, max: number | null] }
    | { op: "wordlist" }
    | { op: UnaryOp; children: [of: Node] }
    | { op: "alternate"; offset: 0 | 1; children: [of: Node] }
    | { op: "remove" | "select"; indices: number[]; children: [of: Node] }
    | { op: "match"; pattern: string; children: [of: Node] }
    | {
        op: "flatMap";
        /** JS source of a `(words: string[]) => Iterable<string>`. */
        fn: string;
        name?: string;
        children: [of: Node];
      }
    | { op: BinaryOp; children: [left: Node, right: Node] }
    | {
        op: "replace" | "replaceAll";
        children: [of: Node, from: Node, to: Node];
      }
    | { op: "replaceAt"; indices: number[]; children: [of: Node, to: Node] }
    | { op: "union"; children: Node[] }
  );

/**
 * Build the Wordset `node` describes. Every Wordset created has its `id` set
 * to the node it came from.
 *
 * `flatMap` nodes evaluate their `fn` as JS, so only build trusted nodes.
 */
export function build(root: Node): Wordset {
  const seen = new Set<NodeId>();

  const tag = (wordset: Wordset, id: NodeId): Wordset => {
    wordset.id = id;
    return wordset;
  };

  const visit = (node: Node): Wordset => {
    if (seen.has(node.id)) {
      throw new Error(`duplicate node id: ${node.id}`);
    }
    seen.add(node.id);

    let wordset: Wordset;
    if (node.pin) {
      wordset = tag(Wordset.values(node.pin), node.id);
    } else if (node.disabled) {
      if (!("children" in node) || node.children.length !== 1) {
        throw new Error(`only one-child nodes can be disabled: ${node.id}`);
      }
      wordset = visit(node.children[0]);
    } else {
      wordset = tag(buildOp(node, visit), node.id);
    }

    if (node.exclude) {
      wordset = tag(wordset.exclude(node.exclude), node.id);
    }
    return wordset;
  };

  return visit(root);
}

function buildOp(node: Node, visit: (node: Node) => Wordset): Wordset {
  switch (node.op) {
    case "literal":
      return Wordset.literal(node.text);
    case "synonym":
      return Wordset.synonym(node.text);
    case "values":
      return Wordset.values(node.words);
    case "any":
      return Wordset.any(Interval.fromJSON(node.length));
    case "wordlist":
      return Wordset.wordlist();
    case "alternate":
      return visit(node.children[0]).alternate(node.offset);
    case "remove":
    case "select":
      return visit(node.children[0])[node.op](node.indices);
    case "match":
      return visit(node.children[0]).match(Pattern.fromJSON(node.pattern));
    case "flatMap":
      return visit(node.children[0]).flatMap(compileFn(node.fn), node.name);
    case "replace":
    case "replaceAll": {
      const [of, from, to] = node.children;
      return visit(of)[node.op](visit(from), visit(to));
    }
    case "replaceAt": {
      const [of, to] = node.children;
      return visit(of).replaceAt(node.indices, visit(to));
    }
    case "union":
      return Wordset.union(node.children.map(visit));
    case "concat":
    case "delete":
    case "deleteAll":
    case "insert":
    case "intersect":
    case "overlap": {
      const [left, right] = node.children;
      return visit(left)[node.op](visit(right));
    }
    default:
      return visit(node.children[0])[node.op]();
  }
}

function compileFn(source: string): (words: string[]) => Iterable<string> {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- flatMap nodes are user-written JS
  const evaluate = new Function(`return (${source});`) as () => unknown;
  const fn = evaluate();
  if (typeof fn !== "function") {
    throw new Error(`flatMap fn is not a function: ${source}`);
  }
  return fn as (words: string[]) => Iterable<string>;
}

/** A Plan as plain data, one entry per node. */
export type PlanData = {
  node: NodeId;
  pattern: string;
  /** Possible lengths. */
  length: [min: number, max: number | null] | null;
  /** How many candidates, if any were pushed down. */
  candidates: number | null;
  children: PlanData[];
};

/**
 * A plan of a built wordset as plain data. Wordsets the build added around a
 * node (an exclude around its op) are collapsed into one entry for the node.
 */
export function planToJSON(plan: Plan): PlanData {
  const id = plan.node.id;
  if (id === undefined) {
    throw new Error("planToJSON: wordset has no id");
  }

  let inner = plan;
  while (inner.children.length === 1 && inner.children[0]!.node.id === id) {
    inner = inner.children[0]!;
  }

  const { pattern, candidates } = plan.args;
  return {
    node: id,
    pattern: pattern.toJSON(),
    length: pattern.length.toJSON(),
    candidates: candidates?.size ?? null,
    children: inner.children.map(planToJSON),
  };
}
