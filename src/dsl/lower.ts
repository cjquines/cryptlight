import { Wordset } from "../wordset.js";
import type { Arg, Call, Expr } from "./ast.js";
import type { LoweredArg } from "./ops.js";
import { OP_BY_NAME } from "./ops.js";

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
      return lowerExpr(expr.left, false).intersect(
        lowerExpr(expr.right, false),
      );
    }
    case "call": {
      return lowerCall(expr);
    }
  }
}

/** Lower an op argument: numbers pass through, expressions are lowered. */
function loweredArg(arg: Arg): LoweredArg {
  return arg.type === "num"
    ? { type: "num", value: arg.value }
    : { type: "set", set: lowerExpr(arg.expr, true) };
}

function lowerCall(call: Call): Wordset {
  const { recv, op, args } = call;
  const def = OP_BY_NAME.get(op);
  if (!def) {
    throw new Error(`unknown op: ${op}`);
  }

  // `?` / `syn:` force a word to be a lookup, overriding the operated rule.
  // They act on the raw word, before it would otherwise be lowered.
  if (def.forcesLookup) {
    if (recv.type !== "word") {
      throw new Error(`${op} can only mark a word as a lookup`);
    }
    if (args.length !== 0) {
      throw new Error(`${op} expects 0 argument(s), got ${args.length}`);
    }
    return Wordset.synonym(recv.word);
  }

  return def.lower!(lowerExpr(recv, true), args.map(loweredArg));
}
