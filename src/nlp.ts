import nlp from "compromise";

export function lemmatize(text: string): string[] {
  return (
    nlp(text).compute("root").json() as [
      { terms: { root?: string; normal: string }[] },
    ]
  )[0].terms.map((t) => t.root ?? t.normal);
}
