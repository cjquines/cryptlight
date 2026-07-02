import type { Wordset } from "../wordset.js";
import { toAST } from "./ast.js";
import { lower } from "./lower.js";

export { toAST } from "./ast.js";
export type { Arg, Call, Expr, Intersect, Word } from "./ast.js";
export { lower } from "./lower.js";

/** Parse and lower a query string into a Wordset. */
export function query(input: string): Wordset {
  return lower(toAST(input));
}
