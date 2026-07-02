import { Wordset } from "../wordset.js";

/**
 * An op argument after lowering: either a number literal or a Wordset (an
 * expression argument that's already been lowered). `lower.ts` produces these
 * before dispatching, so the ops table never needs to lower expressions itself.
 */
export type LoweredArg =
  { type: "num"; value: number } | { type: "set"; set: Wordset };

/** Lower a call of an op: `recv` is already lowered, `args` already reduced. */
type OpLower = (recv: Wordset, args: LoweredArg[]) => Wordset;

export type OpDef = {
  /** Canonical DSL name — what `word.NAME` uses. */
  name: string;
  /** Alternate spellings that behave identically (e.g. `around` → insert). */
  aliases?: string[];
  /** One-line description; completion detail text. Lifted from Wordset docs. */
  doc: string;
  /** Param hint for completion, e.g. "word", "…index", "" for nullary. */
  params: string;
  /** How to lower it. Omitted for the lookup-forcers, which act on the word
   *  *before* it's lowered and so are handled specially in lower.ts. */
  lower?: OpLower;
  /** lookup / synonym / syn: force the receiver word to be a lookup. */
  forcesLookup?: boolean;
};

// Argument validators + combinators. Each takes the op name so the error
// message names the offending op, matching the pre-refactor behavior.

function expectArgs(op: string, args: LoweredArg[], n: number): void {
  if (args.length !== n) {
    throw new Error(`${op} expects ${n} argument(s), got ${args.length}`);
  }
}

function wordsets(op: string, args: LoweredArg[]): Wordset[] {
  return args.map((arg) => {
    if (arg.type !== "set") {
      throw new Error(`${op} expects word arguments, got a number`);
    }
    return arg.set;
  });
}

function oneWordset(op: string, args: LoweredArg[]): Wordset {
  expectArgs(op, args, 1);
  return wordsets(op, args)[0]!;
}

function twoWordsets(op: string, args: LoweredArg[]): [Wordset, Wordset] {
  expectArgs(op, args, 2);
  const [a, b] = wordsets(op, args);
  return [a!, b!];
}

function numbers(op: string, args: LoweredArg[]): number[] {
  if (args.length === 0) {
    throw new Error(`${op} expects at least one number`);
  }
  return args.map((arg) => {
    if (arg.type !== "num") {
      throw new Error(`${op} expects number arguments`);
    }
    return arg.value;
  });
}

function oneNumber(op: string, args: LoweredArg[]): number {
  expectArgs(op, args, 1);
  return numbers(op, args)[0]!;
}

function offset(n: number): 0 | 1 {
  if (n !== 0 && n !== 1) {
    throw new Error(`alternate expects an offset of 0 or 1, got ${n}`);
  }
  return n;
}

function replaceAt(op: string, r: Wordset, args: LoweredArg[]): Wordset {
  if (args.length < 2) {
    throw new Error(`${op} expects indices and a replacement word`);
  }
  const to = args[args.length - 1]!;
  if (to.type !== "set") {
    throw new Error(`${op}'s last argument must be a word`);
  }
  const indices = args.slice(0, -1).map((arg) => {
    if (arg.type !== "num") {
      throw new Error(`${op}'s indices must be numbers`);
    }
    return arg.value;
  });
  return r.replaceAt(indices, to.set);
}

const nullary =
  (op: string, fn: (r: Wordset) => Wordset): OpLower =>
  (r, a) => {
    expectArgs(op, a, 0);
    return fn(r);
  };

const wordsetArg =
  (op: string, fn: (r: Wordset, x: Wordset) => Wordset): OpLower =>
  (r, a) =>
    fn(r, oneWordset(op, a));

const numbersArg =
  (op: string, fn: (r: Wordset, ns: number[]) => Wordset): OpLower =>
  (r, a) =>
    fn(r, numbers(op, a));

const oneNumberArg =
  (op: string, fn: (r: Wordset, n: number) => Wordset): OpLower =>
  (r, a) =>
    fn(r, oneNumber(op, a));

const twoWordsetArg =
  (op: string, fn: (r: Wordset, x: Wordset, y: Wordset) => Wordset): OpLower =>
  (r, a) => {
    const [x, y] = twoWordsets(op, a);
    return fn(r, x, y);
  };

/** The single source of truth for DSL ops: name, docs, and how to lower. */
export const OPS: OpDef[] = [
  // nullary cryptic transformations
  {
    name: "anagram",
    params: "",
    doc: "Anagrams: THIS*",
    lower: nullary("anagram", (r) => r.anagram()),
  },
  {
    name: "reverse",
    params: "",
    doc: "Reverse: SIHT<",
    lower: nullary("reverse", (r) => r.reverse()),
  },
  {
    name: "substring",
    params: "",
    doc: "Hidden word: _HI_",
    lower: nullary("substring", (r) => r.substring()),
  },
  {
    name: "homophone",
    params: "",
    doc: 'Homophone: "THIS"',
    lower: nullary("homophone", (r) => r.homophone()),
  },
  {
    name: "prefix",
    params: "",
    doc: "Proper prefix of each word: TH_",
    lower: nullary("prefix", (r) => r.prefix()),
  },
  {
    name: "suffix",
    params: "",
    doc: "Proper suffix of each word: _IS",
    lower: nullary("suffix", (r) => r.suffix()),
  },
  {
    name: "behead",
    params: "",
    doc: "Delete a leading substring: (-t)HIS",
    lower: nullary("behead", (r) => r.behead()),
  },
  {
    name: "curtail",
    params: "",
    doc: "Delete a trailing substring: THI(-s)",
    lower: nullary("curtail", (r) => r.curtail()),
  },
  {
    name: "ends",
    params: "",
    doc: "Delete a middle substring: T(-hi)S",
    lower: nullary("ends", (r) => r.ends()),
  },
  {
    name: "centers",
    params: "",
    doc: "Center letters of each word: _HI_",
    lower: nullary("centers", (r) => r.centers()),
  },
  {
    name: "wordlike",
    params: "",
    doc: "Keep only word-like results",
    lower: nullary("wordlike", (r) => r.wordlike()),
  },
  {
    name: "head",
    params: "",
    doc: "First letter of each word: T_",
    lower: nullary("head", (r) => r.select([0])),
  },
  {
    name: "tail",
    params: "",
    doc: "Last letter of each word: _S",
    lower: nullary("tail", (r) => r.select([-1])),
  },

  // one-wordset ops
  {
    name: "concat",
    params: "word",
    doc: "Concat: THIS+OTHER",
    lower: wordsetArg("concat", (r, x) => r.concat(x)),
  },
  {
    name: "insert",
    aliases: ["around"],
    params: "word",
    doc: "Containment: TH(OTHER)IS",
    lower: wordsetArg("insert", (r, x) => r.insert(x)),
  },
  {
    name: "inside",
    params: "word",
    doc: "Insert this into other: O(THIS)THER",
    lower: wordsetArg("inside", (r, x) => x.insert(r)),
  },
  {
    name: "delete",
    params: "word",
    doc: "Delete a subsequence: TH(-other)IS",
    lower: wordsetArg("delete", (r, x) => r.delete(x)),
  },
  {
    name: "deleteAll",
    params: "word",
    doc: "Delete every appearance of a subsequence",
    lower: wordsetArg("deleteAll", (r, x) => r.deleteAll(x)),
  },
  {
    name: "union",
    params: "word",
    doc: "Union of two wordsets",
    lower: wordsetArg("union", (r, x) => r.union(x)),
  },

  // number ops
  {
    name: "index",
    params: "index",
    doc: "Keep the letter at one index",
    lower: oneNumberArg("index", (r, n) => r.select([n])),
  },
  {
    name: "select",
    params: "…index",
    doc: "Keep letters at indices: _I_",
    lower: numbersArg("select", (r, ns) => r.select(ns)),
  },
  {
    name: "remove",
    params: "…index",
    doc: "Remove letters at indices: TH_S",
    lower: numbersArg("remove", (r, ns) => r.remove(ns)),
  },
  {
    name: "alternate",
    params: "offset",
    doc: "Alternating letters: ThIs or tHiS",
    lower: oneNumberArg("alternate", (r, n) => r.alternate(offset(n))),
  },

  // replacement ops
  {
    name: "replace",
    params: "word, word",
    doc: "Replace a subsequence: T(from→TO)S",
    lower: twoWordsetArg("replace", (r, from, to) => r.replace(from, to)),
  },
  {
    name: "replaceAll",
    params: "word, word",
    doc: "Replace every appearance of a subsequence",
    lower: twoWordsetArg("replaceAll", (r, from, to) => r.replaceAll(from, to)),
  },
  {
    name: "replaceAt",
    params: "…index, word",
    doc: "Replace letters at indices with a word",
    lower: (r, a) => replaceAt("replaceAt", r, a),
  },

  // lookup-forcers (handled specially in lower.ts, before lowering the word)
  {
    name: "synonym",
    aliases: ["syn", "lookup"],
    params: "",
    doc: "Force a lookup (synonym/abbreviation)",
    forcesLookup: true,
  },
];

/** Every op name and alias mapped to its definition. */
export const OP_BY_NAME = new Map<string, OpDef>(
  OPS.flatMap((op) =>
    [op.name, ...(op.aliases ?? [])].map((n) => [n, op] as const),
  ),
);
