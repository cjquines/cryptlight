function* product2<T, U>(a: Iterable<T>, b: Iterable<U>): Iterable<[T, U]> {
  const aIter = a[Symbol.iterator]();
  const bIter = b[Symbol.iterator]();
  let aSeen: T[] = [];
  let bSeen: U[] = [];

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
          yield [aValue, bValue];
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
          yield [aValue, bValue];
        }
        bSeen.push(bValue);
      }
    }
  }
}

/** Product of iterables. Handles, as a special case, two infinite iterables. */
export function product<T, U>(a: Iterable<T>, b: Iterable<U>): Iterable<[T, U]>;
export function product<T>(...iters: Iterable<T>[]): Iterable<T[]>;
export function* product<T>(...iters: Iterable<T>[]): Iterable<T[]> {
  switch (iters.length) {
    case 0: {
      return;
    }
    case 1: {
      for (const x of iters[0]!) {
        yield [x];
      }
      return;
    }
    case 2: {
      yield* product2(iters[0]!, iters[1]!);
      return;
    }
    default: {
      const [first, ...rest] = iters;
      for (const item of first!) {
        for (const items of product(...rest)) {
          yield [item, ...items];
        }
      }
    }
  }
}
