import nlp from "compromise";

const FILES = [
  "abbreviation",
  "abbreviation2",
  "anagram",
  "charade",
  "container",
  "deletion",
  "hidden",
  "homophone",
  "reversal",
  "selection",
];

/**
 * @param file file where row is from
 * @param row the actual row data
 * @returns string for label
 */
const getLabel = (file, row) => {
  switch (file) {
    case "abbreviation":
      const text = [row.abbr1, row.abbr2, row.abbr3].filter((s) => s !== "");
      return `Abbr: ${row.text} → ${text.join(", ")}`;
    case "abbreviation2":
      return `Abbr: ${row.text} → ${row.letter}`;
    case "anagram":
      return `Anagram: ${row.text}`;
    case "charade":
      return `Charade, ${row.direction}: ${row.text}`;
    case "container":
      if (row.variety === "Insertion") {
        return `Content (X in Y): X ${row.text} Y`;
      } else {
        return `Container (Y in x): X ${row.text} Y`;
      }
    case "deletion":
      if (row.variety === "Expulsion") {
        return `Delete (X – Y): X ${row.text} Y`;
      } else if (row.variety === "Departure") {
        return `Delete (Y – X): X ${row.text} Y`;
      } else {
        const type = row.variety.split(" - ")[1];
        return `Delete (${type}): ${row.text}`;
      }
    case "hidden":
      return `Hidden: ${row.text}`;
    case "homophone":
      return `Homophone: ${row.text}`;
    case "reversal":
      return `Reversal: ${row.text}`;
    case "selection":
      return `Selection, ${row.selection.toLowerCase()}: ${row.text}`;
    default:
      console.assert(false);
  }
};

/**
 * loads the data into an object
 */
export const loadData = async () => {
  const data = {};
  await Promise.all(
    FILES.map(async (name) => {
      const response = await fetch(`./${name}.tsv`);
      const file = await response.text();
      const [header, ...body] = file
        .trim()
        .split("\n")
        .map((line) => line.split("\t"));
      data[name] = body.map((row) => {
        const res = {};
        header.forEach((col, i) => {
          res[col] = row[i];
        });
        return res;
      });
    })
  );
  return data;
};

/**
 * @param text text to search for
 * @returns compromise match syntax query
 */
const matchify = (text) => {
  return text
    .split(/[' -]/)
    .map((token) => {
      if (token.includes("/")) {
        return `(${token.split("/").join("|")})`;
      } else if (token.match(/^\(.*\)$/)) {
        return `${token.substring(1, -1)}?`;
      } else if (token.includes("(")) {
        const groups = token.match(/^(.*)\(.*\)$/);
        return `~${groups[1]}~`;
      } else if (token === "...") {
        return "*";
      } else {
        return `~${token}~`;
      }
    })
    .join(" ");
};

/**
 * helper
 */
const processText = (clue, key, row, text) => {
  const [match] = clue.match(matchify(text)).json({ offset: true });
  return match
    ? {
        range: match.offset,
        label: getLabel(key, row),
      }
    : null;
};

/**
 * helper
 */
const overlapRange = (range, range_) => {
  return (
    range_.start <= range.start + range.length &&
    range_.start + range_.length >= range.start
  );
};

const mergeRange = (range, range_) => {
  const end = range.start + range.length;
  const end_ = range_.start + range_.length;
  const new_start = Math.min(range.start, range_.start);
  const new_end = Math.max(end, end_);
  return { start: new_start, length: new_end - new_start };
};

/**
 * @param data data from loadData
 * @param clueText the text to get ranges for
 * @returns objs[]: obj.range {start, length}; obj.label as string
 */
export const getRanges = (data, clueText) => {
  const result = [];
  const clue = nlp(clueText);
  clue.cache({ root: true });

  for (const [key, val] of Object.entries(data)) {
    for (const row of val) {
      const match = processText(clue, key, row, row.text);
      if (match) result.push(match);
      if (!row.other) continue;
      row.other.split("/").forEach((text) => {
        const match = processText(clue, key, row, text);
        if (match) result.push(match);
      });
    }
  }

  // merge result
  const result_ = result.reduce((acc, { range, label }) => {
    const exist = acc.find((that) => overlapRange(range, that.range));
    if (exist) {
      exist.range = mergeRange(exist.range, range);
      exist.label = exist.label + "<br/>" + label;
    } else {
      acc.push({ range, label });
    }
    return acc;
  }, []);

  // if clue starts with number (e.g. 5.) filter out those
  // if clue ends with enum (e.g. (2, 4)) filter out those
  // for overlapping ranges, take the larger one
  return result_.filter(({ range, label }) => {
    if (range.start === 0 && clueText.match(/^\d+\..*$/)) {
      return false;
    } else if (
      clueText.length - (range.start + range.length) <= 1 &&
      clueText.match(/^.*\(.*\)$/)
    ) {
      return false;
    } else {
      return true;
    }
  });
};
