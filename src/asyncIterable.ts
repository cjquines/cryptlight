// eslint-disable-next-line @typescript-eslint/require-await -- intentional
export async function* from<T>(iterable: Iterable<T>): AsyncIterable<T> {
  for (const item of iterable) {
    yield item;
  }
}

/**
 * Product of two iterables, in a way that works even if they're both infinite.
 * (We will eventually load all of both into memory, though.)
 */
export async function* product<T, U>(
  a: AsyncIterable<T>,
  b: AsyncIterable<U>,
): AsyncIterable<[T, U]> {
  const aIter = a[Symbol.asyncIterator]();
  const bIter = b[Symbol.asyncIterator]();
  let aSeen: T[] = [];
  let bSeen: U[] = [];

  let aDone = false;
  let bDone = false;

  while (!aDone || !bDone) {
    if (!aDone) {
      const aItem = await aIter.next();
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
      const bItem = await bIter.next();
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

export async function toArray<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of iterable) {
    result.push(item);
  }
  return result;
}
