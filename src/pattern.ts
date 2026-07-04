import { createRequire } from "node:module";
import type { CharacterClassBody, RootNode as Node } from "regjsparser";
import regjsparser from "regjsparser";
import { interval, Interval } from "./util.js";

const regjsgen = createRequire(import.meta.url)("regjsgen") as {
  generate: (node: Node) => string;
};

/** The length range of strings a single node can match. */
function nodeLength(node: Node): Interval {
  switch (node.type) {
    case "value":
    case "dot":
    case "characterClass":
    case "characterClassEscape":
      return Interval.of(1);
    case "anchor":
      return Interval.of(0);
    case "alternative":
    case "group":
      return Interval.sum(node.body.map(nodeLength));
    case "disjunction":
      return Interval.join(node.body.map(nodeLength));
    case "quantifier": {
      const inner = nodeLength(node.body[0]);
      const { min, max = Infinity } = node;
      return Interval.of(
        inner.min * min,
        max === Infinity ? (inner.max === 0 ? 0 : Infinity) : inner.max * max,
      );
    }
    case "reference":
      throw new Error(`backreferences are unsupported in /${node.raw}/`);
  }
}

/** Nodes that match exactly one character. */
type Atom = Node & {
  type: "value" | "dot" | "characterClass" | "characterClassEscape";
};

/** Wrap an atom so it matches zero or one of itself (`atom?`). */
function atMost(atom: Atom): Node {
  return {
    type: "quantifier",
    body: [atom],
    min: 0,
    max: 1,
    greedy: true,
    symbol: "?",
    range: [0, 0],
    raw: `${atom.raw}?`,
  };
}

/** An atom matching any single character (`.`). */
function anyAtom(): Atom {
  return { type: "dot", range: [0, 0], raw: "." };
}

/** A node matching any string (`.*`). */
function anyString(): Node {
  return {
    type: "quantifier",
    body: [anyAtom()],
    min: 0,
    greedy: true,
    symbol: "*",
    range: [0, 0],
    raw: ".*",
  };
}

/** The atom matching any char that any of `atoms` can match, or `null`. */
function mergeAtoms(atoms: (Atom | null)[]): Atom | null {
  const nonNull = atoms.filter((atom): atom is Atom => atom !== null);

  if (nonNull.length === 0) {
    return null;
  }
  if (nonNull.length === 1) {
    return nonNull[0]!;
  }

  const options: CharacterClassBody[] = [];

  for (const atom of nonNull) {
    if (atom.type === "value" || atom.type === "characterClassEscape") {
      options.push(atom);
    } else if (atom.type === "characterClass" && !atom.negative) {
      options.push(...atom.body);
    } else {
      return anyAtom();
    }
  }

  return {
    type: "characterClass",
    kind: "union",
    negative: false,
    body: options,
    range: [0, 0],
    raw: "",
  };
}

/** An atom that can match the `i`th char of strings `node` matches. */
function nodeIndex(node: Node, i: number): Atom | null {
  switch (node.type) {
    case "value":
    case "dot":
    case "characterClass":
    case "characterClassEscape":
      return i === 0 ? node : null;
    case "anchor":
      return null;
    case "alternative":
    case "group":
      return nodesIndex(node.body, i);
    case "disjunction":
      return mergeAtoms(node.body.flatMap((branch) => nodeIndex(branch, i)));
    case "quantifier": {
      const unit = Math.max(1, nodeLength(node.body[0]).min);
      const { max = Infinity } = node;
      const repeats = Math.min(Math.floor(i / unit) + 1, max);
      const repeated = interval(1, repeats).map(() => node.body[0]);
      return nodesIndex(repeated, i);
    }
    case "reference":
      throw new Error(`backreferences are unsupported in /${node.raw}/`);
  }
}

/** `nodeIndex` over a sequence of nodes. */
function nodesIndex(nodes: Node[], index: number): Atom | null {
  let prefix = Interval.of(0);
  const choices: (Atom | null)[] = [];

  for (const node of nodes) {
    if (index < prefix.min) {
      break;
    }
    for (const i of Interval.of(index).sub(prefix).meet(Interval.nonnegative)) {
      choices.push(nodeIndex(node, i));
    }
    prefix = prefix.add(nodeLength(node));
  }

  return mergeAtoms(choices);
}

/** Node matching the reversal of strings `node` matches. */
function nodeReverse(node: Node): Node {
  switch (node.type) {
    case "value":
    case "dot":
    case "characterClass":
    case "characterClassEscape":
      return node;
    case "quantifier":
      return { ...node, body: [nodeReverse(node.body[0])] };
    case "group":
    case "alternative":
      return { ...node, body: node.body.map(nodeReverse).reverse() };
    case "disjunction":
      return {
        ...node,
        body: node.body.map(nodeReverse) as [Node, Node, ...Node[]],
      };
    case "anchor":
      return node;
    case "reference":
      throw new Error(`backreferences are unsupported in /${node.raw}/`);
  }
}

/**
 * A regex that's anchored (`^...$`), limited (no backrefs), and
 * case-insensitive (flag `i`), with slicing and length support.
 */
export class Pattern {
  /** The interior, non-anchored nodes that make up this pattern. */
  private nodes: Node[];
  private regexp: RegExp | undefined = undefined;

  private constructor(nodes: Node[]) {
    this.nodes = nodes;
  }

  /** Parse an input. Regexes must be fully anchored (`^...$`). */
  static parse(input: RegExp): Pattern {
    const root = regjsparser.parse(input.source, input.flags);
    if (root.type !== "alternative") {
      throw new Error(`failed to parse regex: /${input.source}/`);
    }
    const first = root.body[0];
    const last = root.body.at(-1);
    if (
      first?.type !== "anchor" ||
      first.kind !== "start" ||
      last?.type !== "anchor" ||
      last.kind !== "end"
    ) {
      throw new Error(`pattern must be anchored with ^...$: /${input.source}/`);
    }
    return new Pattern(root.body.slice(1, -1));
  }

  /** A pattern matching any string of length in `length`. */
  static length(length: Interval): Pattern {
    const min = Math.max(0, length.min);
    const max = Math.max(min, length.max);
    return Pattern.parse(
      new RegExp(`^.{${min},${max === Infinity ? "" : max}}$`),
    );
  }

  /** A pattern matching any string. */
  static get any(): Pattern {
    return Pattern.parse(/^.*$/);
  }

  #source: string | null = null;

  /** The regex source, including the `^...$` anchors. */
  get source(): string {
    return (this.#source ??= `^${this.nodes.map(regjsgen.generate).join("")}$`);
  }

  #length: Interval | null = null;

  /** The lengths of strings `this` can match. */
  get length(): Interval {
    return (this.#length ??= Interval.sum(this.nodes.map(nodeLength)));
  }

  test(string: string): boolean {
    return (this.regexp ??= new RegExp(this.source, "i")).test(string);
  }

  /** A Pattern matching a prefix of a `this`-match with length in `length`. */
  prefixes(length: Interval): Pattern {
    const nodes: Node[] = [];

    for (let i = 0; i < length.max; i++) {
      const atom = nodesIndex(this.nodes, i);
      if (atom === null) {
        break;
      }
      if (i >= length.min && length.max === Infinity) {
        nodes.push(anyString());
        break;
      }
      nodes.push(i >= length.min ? atMost(atom) : atom);
    }

    return new Pattern(nodes);
  }

  /** A Pattern matching the reversal of strings `this` matches. */
  reverse(): Pattern {
    return new Pattern(this.nodes.map(nodeReverse).reverse());
  }

  #oneLook: string | null = null;

  /** Convert a pattern to a OneLook/Datamuse-compatible wildcard. */
  get oneLook(): string {
    // TODO: make this tighter?
    return (this.#oneLook ??=
      "?".repeat(this.length.min) +
      (this.length.max > this.length.min ? "*" : ""));
  }
}
