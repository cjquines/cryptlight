import nlp from "compromise";

export function lemmatize(text: string): {
  text: string;
  lemma: string;
}[] {
  return (
    (
      nlp(text).compute("root").json() as {
        terms?: {
          text: string;
          pre: string;
          post: string;
          root?: string;
          normal: string;
        }[];
      }[]
    )[0]?.terms?.map((t) => ({
      text: `${t.pre}${t.text}${t.post}`,
      lemma: t.root ?? t.normal,
    })) ?? []
  );
}

/**
 * An inflection that a definition can carry and a synonym must match:
 * "birds" (plural, which also covers third-person "-s" verbs), "threatened",
 * "running", "bigger", "sleepiest".
 */
export type Inflection =
  "plural" | "past" | "gerund" | "comparative" | "superlative";

type Term = { text: string; tags: string[] };

function lastTerm(text: string): Term | undefined {
  return (nlp(text).json() as { terms?: Term[] }[])[0]?.terms?.at(-1);
}

/**
 * If the last word of `text` is inflected, how, and `text` with that word
 * replaced by its base form: "Gut parasites" → plural, "gut parasite".
 */
export function uninflect(
  text: string,
): { inflection: Inflection; base: string } | null {
  const term = lastTerm(text);
  if (term === undefined) {
    return null;
  }
  const tags = new Set(term.tags);
  const word = term.text.toLowerCase();

  let inflection: Inflection | null = null;
  if (tags.has("Gerund")) {
    inflection = "gerund";
  } else if (tags.has("Superlative")) {
    inflection = "superlative";
  } else if (tags.has("Comparative")) {
    inflection = "comparative";
  } else if (
    tags.has("Plural") ||
    (tags.has("PresentTense") && word.endsWith("s"))
  ) {
    inflection = "plural";
  } else if (
    tags.has("PastTense") ||
    (tags.has("Adjective") && word.endsWith("ed"))
  ) {
    inflection = "past";
  }
  if (inflection === null) {
    return null;
  }

  const terms = lemmatize(text).map(({ lemma }) => lemma);
  if (inflection === "past") {
    // "threatened" is tagged as an adjective, whose lemma is itself.
    const doc = nlp(word);
    doc.tag("PastTense");
    terms[terms.length - 1] = doc.verbs().toInfinitive().text();
  }
  const base = terms.join(" ");
  return base === text.toLowerCase() ? null : { inflection, base };
}

/** Inflect the last word of `phrase`: ("oil slick", "plural") → ["oil slicks"]. */
export function inflect(phrase: string, inflection: Inflection): string[] {
  const split = phrase.lastIndexOf(" ") + 1;
  const [head, word] = [phrase.slice(0, split), phrase.slice(split)];
  const verb = () =>
    nlp(word).verbs().conjugate()[0] as Record<string, string> | undefined;
  const adjective = () =>
    nlp(word).adjectives().conjugate()[0] as Record<string, string> | undefined;

  const forms = (() => {
    switch (inflection) {
      case "plural": {
        // A bare word like "slick" may not be tagged as a noun on its own.
        const doc = nlp(word);
        if (doc.nouns().length === 0 && doc.verbs().length === 0) {
          doc.tag("Noun");
        }
        return [doc.nouns().toPlural().text(), verb()?.["PresentTense"]];
      }
      case "past":
        return [verb()?.["PastTense"]];
      case "gerund":
        return [verb()?.["Gerund"]];
      case "comparative":
        return [adjective()?.["Comparative"]];
      case "superlative":
        return [adjective()?.["Superlative"]];
    }
  })();

  return [
    ...new Set(
      forms
        .filter((form): form is string => !!form && form !== word)
        .map((form) => head + form),
    ),
  ];
}
