import type { SyntaxNode } from "@lezer/common";
import { parser } from "./parser.js";

/** A parsed query expression. Every operation desugars to a `Call`. */
export type Expr = Word | Call | Intersect;

/** A bare or quoted word. Whether it's a literal or a lookup is decided when
 * lowering, based on whether an operation is applied to it. */
export type Word = { type: "word"; word: string };

/**
 * `recv.op(args)`. Also the desugared form of the sigils (`*` anagram, `<`
 * reverse, `?` lookup), the prefix form (`op:recv`), infix `+` (concat), and
 * indexing (`recv[i]`, as op `index`).
 */
export type Call = { type: "call"; recv: Expr; op: string; args: Arg[] };

export type Arg = { type: "expr"; expr: Expr } | { type: "num"; value: number };

/** `left = right`: intersection. A bare word on either side is a lookup. */
export type Intersect = { type: "intersect"; left: Expr; right: Expr };

/** Sigil node names mapped to the op they desugar to. */
const sigilOp: Record<string, string> = {
  Anagram: "anagram",
  Reverse: "reverse",
  Lookup: "lookup",
};

const exprNodes = new Set([
  "Word",
  "Parenthesized",
  "Postfix",
  "Call",
  "Index",
  "Prefix",
  "Concat",
  "Intersect",
]);

/** The expression-typed children of a node, in order. */
function exprKids(node: SyntaxNode): SyntaxNode[] {
  const kids: SyntaxNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (exprNodes.has(c.name)) {
      kids.push(c);
    }
  }
  return kids;
}

function text(input: string, node: SyntaxNode): string {
  return input.slice(node.from, node.to);
}

function nodeToAST(input: string, node: SyntaxNode): Expr {
  switch (node.name) {
    case "Word": {
      const raw = text(input, node);
      const word = raw.startsWith('"') ? raw.slice(1, -1) : raw;
      return { type: "word", word };
    }
    case "Parenthesized": {
      return nodeToAST(input, exprKids(node)[0]!);
    }
    case "Postfix": {
      const [inner] = exprKids(node);
      const sigil =
        node.getChild("Anagram") ??
        node.getChild("Reverse") ??
        node.getChild("Lookup");
      return {
        type: "call",
        recv: nodeToAST(input, inner!),
        op: sigilOp[sigil!.name]!,
        args: [],
      };
    }
    case "Call": {
      const [recv] = exprKids(node);
      const op = text(input, node.getChild("OpName")!);
      const argList = node.getChild("ArgList");
      return {
        type: "call",
        recv: nodeToAST(input, recv!),
        op,
        args: argList ? argsToAST(input, argList) : [],
      };
    }
    case "Index": {
      const [recv] = exprKids(node);
      const value = parseInt(text(input, node.getChild("Number")!), 10);
      return {
        type: "call",
        recv: nodeToAST(input, recv!),
        op: "index",
        args: [{ type: "num", value }],
      };
    }
    case "Prefix": {
      const op = text(input, node.getChild("OpName")!);
      const [operand] = exprKids(node);
      return {
        type: "call",
        recv: nodeToAST(input, operand!),
        op,
        args: [],
      };
    }
    case "Concat": {
      const [left, right] = exprKids(node);
      return {
        type: "call",
        recv: nodeToAST(input, left!),
        op: "concat",
        args: [{ type: "expr", expr: nodeToAST(input, right!) }],
      };
    }
    case "Intersect": {
      const [left, right] = exprKids(node);
      return {
        type: "intersect",
        left: nodeToAST(input, left!),
        right: nodeToAST(input, right!),
      };
    }
    default: {
      throw new Error(`unexpected node: ${node.name}`);
    }
  }
}

function argsToAST(input: string, argList: SyntaxNode): Arg[] {
  const args: Arg[] = [];
  for (const arg of argList.getChildren("Argument")) {
    const child = arg.firstChild!;
    if (child.name === "Number") {
      args.push({ type: "num", value: parseInt(text(input, child), 10) });
    } else {
      args.push({ type: "expr", expr: nodeToAST(input, child) });
    }
  }
  return args;
}

/** Parse a query string into an AST. Throws on a syntax error. */
export function toAST(input: string): Expr {
  const tree = parser.parse(input);
  const top = tree.topNode.firstChild;
  if (!top) {
    throw new Error(`empty query: ${input}`);
  }
  return nodeToAST(input, top);
}
