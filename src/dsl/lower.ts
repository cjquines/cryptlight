import { Wordset } from "../wordset.js";
import type { Arg, Call, Expr } from "./ast.js";

/**
 * Lower an AST to a Wordset.
 *
 * A bare word is a *lookup* (synonyms/abbreviations) when no operation is
 * applied to it, and a *literal* otherwise. So the definition in `X = fruits`
 * looks up "fruits", `apple = fruits` is a double definition, but the fodder
 * in `pets.head` is the literal PETS. A trailing `?` (op `lookup`) forces a
 * word to be a lookup even under an operation.
 */
export function lower(expr: Expr): Wordset {
  return lowerExpr(expr, false);
}

function lowerExpr(expr: Expr, operated: boolean): Wordset {
  switch (expr.type) {
    case "word": {
      return operated ? Wordset.literal(expr.word) : Wordset.synonym(expr.word);
    }
    case "intersect": {
      // Each side of `=` is its own definitional context: an unoperated word
      // there is a lookup, giving double definitions for free.
      return lowerExpr(expr.left, false).intersect(lowerExpr(expr.right, false));
    }
    case "call": {
      return lowerCall(expr);
    }
  }
}

/** Ops that take no arguments and map straight to a Wordset method. */
const nullary: Record<string, (w: Wordset) => Wordset> = {
  anagram: (w) => w.anagram(),
  reverse: (w) => w.reverse(),
  substring: (w) => w.substring(),
  homophone: (w) => w.homophone(),
  prefix: (w) => w.prefix(),
  suffix: (w) => w.suffix(),
  behead: (w) => w.behead(),
  curtail: (w) => w.curtail(),
  ends: (w) => w.ends(),
  centers: (w) => w.centers(),
  wordlike: (w) => w.wordlike(),
  head: (w) => w.select([0]),
  tail: (w) => w.select([-1]),
};

function lowerCall(call: Call): Wordset {
  const { recv, op, args } = call;

  // `?` / `syn:` force a word to be a lookup, overriding the operated rule.
  if (op === "lookup" || op === "synonym" || op === "syn") {
    if (recv.type !== "word") {
      throw new Error(`${op} can only mark a word as a lookup`);
    }
    expectArgs(op, args, 0);
    return Wordset.synonym(recv.word);
  }

  const r = lowerExpr(recv, true);

  if (op in nullary) {
    expectArgs(op, args, 0);
    return nullary[op]!(r);
  }

  switch (op) {
    case "concat":
      return r.concat(oneWordset(op, args));
    case "around":
    case "insert":
      return r.insert(oneWordset(op, args));
    case "inside":
      return oneWordset(op, args).insert(r);
    case "delete":
      return r.delete(oneWordset(op, args));
    case "deleteAll":
      return r.deleteAll(oneWordset(op, args));
    case "union":
      return r.union(oneWordset(op, args));

    case "index":
      return r.select([oneNumber(op, args)]);
    case "select":
      return r.select(numbers(op, args));
    case "remove":
      return r.remove(numbers(op, args));
    case "alternate":
      return r.alternate(offset(oneNumber(op, args)));

    case "replace": {
      const [from, to] = twoWordsets(op, args);
      return r.replace(from, to);
    }
    case "replaceAll": {
      const [from, to] = twoWordsets(op, args);
      return r.replaceAll(from, to);
    }
    case "replaceAt":
      return lowerReplaceAt(r, args);

    default:
      throw new Error(`unknown op: ${op}`);
  }
}

function lowerReplaceAt(r: Wordset, args: Arg[]): Wordset {
  if (args.length < 2) {
    throw new Error("replaceAt expects indices and a replacement word");
  }
  const to = args[args.length - 1]!;
  if (to.type !== "expr") {
    throw new Error("replaceAt's last argument must be a word");
  }
  const indices = args.slice(0, -1).map((arg) => {
    if (arg.type !== "num") {
      throw new Error("replaceAt's indices must be numbers");
    }
    return arg.value;
  });
  return r.replaceAt(indices, lowerExpr(to.expr, true));
}

function expectArgs(op: string, args: Arg[], n: number): void {
  if (args.length !== n) {
    throw new Error(`${op} expects ${n} argument(s), got ${args.length}`);
  }
}

function wordsets(op: string, args: Arg[]): Wordset[] {
  return args.map((arg) => {
    if (arg.type !== "expr") {
      throw new Error(`${op} expects word arguments, got a number`);
    }
    return lowerExpr(arg.expr, true);
  });
}

function oneWordset(op: string, args: Arg[]): Wordset {
  expectArgs(op, args, 1);
  return wordsets(op, args)[0]!;
}

function twoWordsets(op: string, args: Arg[]): [Wordset, Wordset] {
  expectArgs(op, args, 2);
  const [a, b] = wordsets(op, args);
  return [a!, b!];
}

function numbers(op: string, args: Arg[]): number[] {
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

function oneNumber(op: string, args: Arg[]): number {
  expectArgs(op, args, 1);
  return numbers(op, args)[0]!;
}

function offset(n: number): 0 | 1 {
  if (n !== 0 && n !== 1) {
    throw new Error(`alternate expects an offset of 0 or 1, got ${n}`);
  }
  return n;
}
