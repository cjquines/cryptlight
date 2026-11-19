declare class URL {
  constructor(url: string, base?: string);
  readonly href: string;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- merges with the built-in ImportMeta
interface ImportMeta {
  readonly url: string;
}

declare function fetch(input: string | URL): Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

declare function setTimeout(
  callback: (...args: never[]) => void,
  ms: number,
): unknown;

declare class AbortSignal {
  readonly aborted: boolean;
  readonly reason: unknown;
  throwIfAborted(): void;
}
