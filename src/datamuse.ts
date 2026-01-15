export type DatamuseParams = {
  /**
   * **Means like** constraint: require that the results have a meaning related
   * to this string value, which can be any word or sequence of words. (This is
   * effectively the [reverse dictionary](https://onelook.com/reverse-dictionary.shtml)
   * feature of OneLook.)
   */
  meansLike?: string;
  /**
   * **Sounds like** constraint: require that the results are pronounced
   * similarly to this string of characters. (If the string of characters
   * doesn't have a known pronunciation, the system will make its best guess
   * using a text-to-phonemes algorithm.)
   */
  soundsLike?: string;
  /**
   * **Spelled like** constraint: require that the results are spelled
   * similarly to this string of characters, or that they match this [wildcard
   * pattern](https://onelook.com/thesaurus/#patterns). A pattern can include
   * any combination of alphanumeric characters and the symbols described on
   * that page. The most commonly used symbols are * (a placeholder for any
   * number of characters) and ? (a placeholder for exactly one character).
   */
  spelledLike?: string;

  // Note: The descriptions we use for the related word constraints are the
  // opposite relationship described by the API, so as to read more naturally.
  // (e.g. rel_spc=gondola gives "boat", and "boat" "has example" "gondola".)

  /**
   * Popular nouns modified by the given adjective, per Google Books Ngrams.
   *
   * @example nounAfter: ["gradual"] => "increase"
   */
  nounAfter?: string[];
  /**
   * Popular adjectives used to modify the given noun, per Google Books Ngrams.
   *
   * @example adjectiveBefore: ["beach"] => "sandy"
   */
  adjectiveBefore?: string[];
  /**
   * Synonyms (words contained within the same WordNet synset).
   *
   * @example synonymOf: ["ocean"] => "sea"
   */
  synonymOf?: string[];
  /**
   * "Triggers" (words that are statistically associated with the query word in
   * the same piece of text.)
   *
   * @example triggeredBy: ["cow"] => "milking"
   */
  triggeredBy?: string[];
  /**
   * Antonyms (per WordNet).
   *
   * @example antonymOf: ["late"] => "early"
   */
  antonymOf?: string[];
  /**
   * "More general than" (direct hyponyms, per WordNet).
   *
   * @example hasExample: ["gondola"] => "boat"
   */
  hasExample?: string[];
  /**
   * "Kind of" (direct hypernyms, per WordNet).
   *
   * @example kindOf: ["boat"] => "gondola"
   */
  kindOf?: string[];
  /**
   * "Part of" (direct meronyms, per WordNet)
   *
   * @example partOf: ["car"] => "accelerator"
   */
  partOf?: string[];
  /**
   * "Comprises" (direct holonyms, per WordNet)
   *
   * @example hasPart: ["trunk"] => "tree"
   */
  hasPart?: string[];
  /**
   * Frequent predecessors (w′ such that P(w|w′) ≥ 0.001, per Google Books
   * Ngrams).
   *
   * @example comesAfter: ["wreak"] => "havoc"
   */
  comesAfter?: string[];
  /**
   * Frequent followers (w′ such that P(w′|w) ≥ 0.001, per Google Books
   * Ngrams).
   *
   * @example comesBefore: ["havoc"] => "wreak"
   */
  comesBefore?: string[];
  /**
   * Homophones (sound-alike words).
   *
   * @example homophoneOf: ["course"] => "coarse"
   */
  homophoneOf?: string[];
  /**
   * Consonant match.
   *
   * @example consonancy: ["sample"] => "simple"
   */
  consonancy?: string[];
  /**
   * Identifier for the vocabulary to use:
   * - "english" is a 550,000-term vocabulary of English words and multiword
   *   expressions.
   * - "spanish" is a 500,000-term vocabulary of words from Spanish-language
   *   books.
   */
  vocabulary?: "english" | "spanish";
  /**
   * **Topic words**: An optional hint to the system about the theme of the
   * document being written. Results will be skewed toward these topics. At
   * most 5 words can be specified. Space or comma delimited. Nouns work best.
   */
  topicWords?: string[];
  /**
   * **Left context**: An optional hint to the system about the word that
   * appears immediately to the left of the target word in a sentence.
   */
  leftContext?: string;
  /**
   * **Right context**: An optional hint to the system about the word that
   * appears immediately to the right of the target word in a sentence.
   */
  rightContext?: string;
  /**
   * **Maximum** number of results to return, not to exceed 1000. (default: 100)
   */
  maxResults?: number;
  /**
   * **Metadata** flags: A list requesting that extra lexical knowledge be
   * included with the results.
   */
  metadata?: (//
  /**
   * Produced in the defs field of the result object. The definitions are
   * from Wiktionary and WordNet. If the word is an inflected form (such as
   * the plural of a noun or a conjugated form of a verb), then an additional
   * defHeadword field will be added indicating the base form from which the
   * definitions are drawn.
   */
  | "definitions"
    /**
     * One or more part-of-speech codes will be added to the tags field of the
     * result object. "n" means noun, "v" means verb, "adj" means adjective,
     * "adv" means adverb, and "u" means that the part of speech is none of
     * these or cannot be determined. Multiple entries will be added when the
     * word's part of speech is ambiguous, with the most popular part of speech
     * listed first. This field is derived from an analysis of Google Books
     * Ngrams data.
     */
    | "partsOfSpeech"
    /**
     * Produced in the numSyllables field of the result object. In certain
     * cases the number of syllables may be ambiguous, in which case the
     * system's best guess is chosen based on the entire query.
     */
    | "syllableCount"
    /**
     * Produced in the tags field of the result object, prefixed by "pron:".
     * This is the system's best guess for the pronunciation of the word or
     * phrase. The format of the pronunication is a space-delimited list of
     * Arpabet phoneme codes. Note that for terms that are very rare or outside
     * of the vocabulary, the pronunciation will be guessed based on the
     * spelling. In certain cases the pronunciation may be ambiguous, in which
     * case the system's best guess is chosen based on the entire query.
     */
    | "pronunciationArpabet"
    /**
     * Produced in the tags field of the result object, prefixed by "pron:".
     * This is the system's best guess for the pronunciation of the word or
     * phrase. The pronunciation string uses the International Phonetic
     * Alphabet. Note that for terms that are very rare or outside of the
     * vocabulary, the pronunciation will be guessed based on the spelling. In
     * certain cases the pronunciation may be ambiguous, in which case the
     * system's best guess is chosen based on the entire query.
     */
    | "pronunciationIPA"
    /**
     * Produced in the tags field of the result object, prefixed by "f:". The
     * value is the number of times the word (or multi-word phrase) occurs per
     * million words of English text according to Google Books Ngrams.
     */
    | "wordFrequency"
  )[];
  /**
   * Query echo: The presence of this parameter asks the system to prepend a
   * result to the output that describes the query string from some other
   * parameter, specified as the argument value. This is useful for looking up
   * metadata about specific words. For example, /words?sp=flower&qe=sp&md=fr
   * can be used to get the pronunciation and word frequency for flower.
   */
  queryEcho?: string;
};

export type DatamuseResult = {
  word: string;
  score: number;
  defs?: string[];
  numSyllables?: number;
  tags?: string[];
};

const paramMap = {
  meansLike: "ml",
  soundsLike: "sl",
  spelledLike: "sp",
  nounAfter: "rel_jja",
  adjectiveBefore: "rel_jjb",
  synonymOf: "rel_syn",
  triggeredBy: "rel_trg",
  antonymOf: "rel_ant",
  hasExample: "rel_spc",
  kindOf: "rel_gen",
  partOf: "rel_com",
  hasPart: "rel_par",
  comesAfter: "rel_bga",
  comesBefore: "rel_bgb",
  homophoneOf: "rel_hom",
  consonancy: "rel_cns",
  vocabulary: "v",
  topicWords: "topics",
  leftContext: "lc",
  rightContext: "rc",
  maxResults: "max",
  metadata: "md",
  queryEcho: "qe",
} as const satisfies Record<keyof DatamuseParams, string>;

export function* queryParts(
  params: DatamuseParams,
): Generator<[string, string]> {
  for (const key of Object.keys(params) as (keyof DatamuseParams)[]) {
    const param = paramMap[key];
    switch (key) {
      case "nounAfter":
      case "adjectiveBefore":
      case "synonymOf":
      case "triggeredBy":
      case "antonymOf":
      case "hasExample":
      case "kindOf":
      case "partOf":
      case "hasPart":
      case "comesAfter":
      case "comesBefore":
      case "homophoneOf":
      case "consonancy": {
        const value = params[key]!;
        for (const word of value) {
          yield [param, word];
        }
        break;
      }
      case "vocabulary": {
        const value = params[key]!;
        if (value === "spanish") {
          yield [param, "es"];
        }
        break;
      }
      case "topicWords": {
        const value = params[key]!;
        yield [param, value.join(",")];
        break;
      }
      case "metadata": {
        const value = params[key]!;
        const letters = [];

        for (const item of value) {
          switch (item) {
            case "definitions": {
              letters.push("d");
              break;
            }
            case "partsOfSpeech": {
              letters.push("p");
              break;
            }
            case "syllableCount": {
              letters.push("s");
              break;
            }
            case "pronunciationArpabet": {
              letters.push("r");
              break;
            }
            case "pronunciationIPA": {
              letters.push("r");
              yield ["ipa", "1"];
              break;
            }
            case "wordFrequency": {
              letters.push("f");
              break;
            }
            default: {
              item satisfies never;
            }
          }
        }

        yield [param, letters.join("")];
        break;
      }
      case "maxResults": {
        const value = params[key]!;
        yield [param, value.toString()];
        break;
      }
      case "meansLike":
      case "soundsLike":
      case "spelledLike":
      case "leftContext":
      case "rightContext":
      case "queryEcho": {
        const value = params[key]!;
        yield [param, value];
        break;
      }
      default: {
        key satisfies never;
      }
    }
  }
}

export async function datamuse(
  params: DatamuseParams,
): Promise<DatamuseResult[]> {
  const queryString = Array.from(queryParts(params))
    .map(([key, value]) => {
      const encoded = encodeURIComponent(value);
      return `${key}=${encoded}`;
    })
    .join("&");

  const url = `https://api.datamuse.com/words?${queryString}`;
  const response = await fetch(url);
  const results = (await response.json()) as DatamuseResult[];

  return results;
}
