import { expect } from "vitest";
import { Interval } from "./src/util.js";

expect.addEqualityTesters([
  (a, b) => {
    const isAInterval = a instanceof Interval;
    const isBInterval = b instanceof Interval;
    if (isAInterval && isBInterval) {
      return a.equals(b);
    }
    if (isAInterval || isBInterval) {
      return false;
    }
    return undefined;
  },
]);
