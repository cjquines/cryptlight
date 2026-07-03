import { Interval } from "./util.js";

// TODO: this should probably be a more specific "Pattern" class, which we
// run concat / delete / slice / whatever on directly
export class Regex extends RegExp {
  #length: Interval | null = null;

  /** The length range of strings `this` can match. */
  get length(): Interval {
    if (this.#length !== null) {
      return this.#length;
    }

    const src = this.source;
    let result = Interval.of(0);
    let i = 0;

    while (i < src.length) {
      const c = src[i]!;

      if (c === "^" || c === "$") {
        i++;
        continue;
      } else if (c === "\\") {
        i += 2;
      } else if (c === "[") {
        const j = src.indexOf("]", i);
        if (j === -1) {
          throw new Error(`unbalanced [ in /${src}/`);
        }
        i = j + 1;
      } else if (c === "." || /[A-Za-z]/.test(c)) {
        i++;
      } else {
        throw new Error(`unsupported regex char '${c}' in /${src}/`);
      }

      const rep = Interval.of(1);
      const q = src[i];

      if (q === "?") {
        rep.min = 0;
        i++;
      } else if (q === "*") {
        rep.min = 0;
        rep.max = Infinity;
        i++;
      } else if (q === "+") {
        rep.max = Infinity;
        i++;
      } else if (q === "{") {
        const j = src.indexOf("}", i);
        if (j === -1) {
          throw new Error(`unbalanced { in /${src}/`);
        }
        const bound = /^(\d+)(,(\d*))?$/.exec(src.slice(i + 1, j));
        if (!bound) {
          throw new Error(`bad {} quantifier in /${src}/`);
        }
        rep.min = parseInt(bound[1]!, 10);
        rep.max =
          bound[2] === undefined
            ? rep.min
            : bound[3]
              ? parseInt(bound[3], 10)
              : Infinity;
        i = j + 1;
      }

      result = result.add(rep);
    }

    this.#length = result;
    return result;
  }

  static length(regex: RegExp): Interval {
    return new Regex(regex).length;
  }
}
