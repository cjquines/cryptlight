import { interval } from "./util.js";

/**
 * Product of two iterables, in a way that works even if they're both infinite.
 * (We will eventually load all of both into memory, though.)
 */
export function* product<T>(a: Iterable<T>, b: Iterable<T>): Iterable<[T, T]> {
  const aIter = a[Symbol.iterator]();
  const bIter = b[Symbol.iterator]();
  let aSeen: T[] = [];
  let bSeen: T[] = [];

  let aDone = false;
  let bDone = false;

  while (!aDone || !bDone) {
    if (!aDone) {
      const aItem = aIter.next();
      if (aItem.done) {
        aDone = true;
        // explicit clear
        bSeen = [];
      } else {
        const aValue = aItem.value;
        for (const bValue of bSeen) {
          yield [aValue, bValue] as [T, T];
        }
        aSeen.push(aValue);
      }
    }
    if (!bDone) {
      const bItem = bIter.next();
      if (bItem.done) {
        bDone = true;
        // explicit clear
        aSeen = [];
      } else {
        const bValue = bItem.value;
        for (const aValue of aSeen) {
          yield [aValue, bValue] as [T, T];
        }
        bSeen.push(bValue);
      }
    }
  }
}

export function* chain<T>(iterables: Iterable<Iterable<T>>): Iterable<T> {
  for (const iterable of iterables) {
    for (const item of iterable) {
      yield item;
    }
  }
}

export function* diagonalize<T>(iters: Iterable<Iterable<T>>): Iterable<T> {
  const seen: Iterator<T>[] = [];
  for (const iter of iters) {
    seen.push(iter[Symbol.iterator]());
    for (const i of interval(seen.length - 1, 0, -1)) {
      const item = seen[i]!.next();
      if (!item.done) {
        yield item.value;
      } else {
        seen.splice(i, 1);
      }
    }
  }
  while (seen.length > 0) {
    for (const i of interval(seen.length - 1, 0, -1)) {
      const item = seen[i]!.next();
      if (!item.done) {
        yield item.value;
      } else {
        seen.splice(i, 1);
      }
    }
  }
}

export function* flatMap<T, R>(
  iter: Iterable<T>,
  fn: (item: T) => Iterable<R>,
): Iterable<R> {
  for (const item of iter) {
    yield* fn(item);
  }
}

export function* map<T, R>(iter: Iterable<T>, fn: (item: T) => R): Iterable<R> {
  for (const item of iter) {
    yield fn(item);
  }
}
