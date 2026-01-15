import nlp from "compromise";

export function lemmatize(text: string): {
  text: string;
  lemma: string;
}[] {
  return (
    nlp(text).compute("root").json() as [
      {
        terms: {
          text: string;
          pre: string;
          post: string;
          root?: string;
          normal: string;
        }[];
      },
    ]
  )[0].terms.map((t) => ({
    text: `${t.pre}${t.text}${t.post}`,
    lemma: t.root ?? t.normal,
  }));
}
