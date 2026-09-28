declare function fetch(input: string): Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

declare function setTimeout(
  callback: (...args: never[]) => void,
  ms: number,
): unknown;
