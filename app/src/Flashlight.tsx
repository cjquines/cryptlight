import * as Floating from "@floating-ui/react";
import type { IndicatorMatch } from "cryptlight";
import { useState } from "react";
import "./Flashlight.css";
import { useStore } from "./store";

/** For phrase ending at `end`. */
type GroupedMatches = {
  end: number;
  phrase: string;
  matches: IndicatorMatch[];
};

function groupMatches(
  line: { text: string }[],
  matches: IndicatorMatch[],
  start: number,
): GroupedMatches[] {
  const byEnd = new Map<number, IndicatorMatch[]>();
  for (const match of matches) {
    if (match.start !== start) continue;
    byEnd.set(match.end, [...(byEnd.get(match.end) ?? []), match]);
  }
  return [...byEnd]
    .sort(([a], [b]) => a - b)
    .map(([end, matches]) => ({
      end,
      phrase: line
        .slice(start, end + 1)
        .map((token) => token.text)
        .join("")
        .trim(),
      matches: matches.sort((a, b) => b.score - a.score),
    }));
}

function FlashlightToken({
  text,
  phrases,
}: {
  text: string;
  phrases: GroupedMatches[];
}) {
  const trimmed = text.trim();
  const hasTooltip = phrases.length > 0;
  const [tooltipActive, setTooltipActive] = useState(false);
  const { refs, floatingStyles, context } = Floating.useFloating({
    open: tooltipActive,
    onOpenChange: setTooltipActive,
    middleware: [Floating.offset(10), Floating.flip(), Floating.shift()],
    whileElementsMounted: Floating.autoUpdate,
  });
  const { getReferenceProps, getFloatingProps } = Floating.useInteractions([
    Floating.useHover(context, { enabled: hasTooltip, move: false }),
    Floating.useFocus(context, { enabled: hasTooltip }),
    Floating.useDismiss(context),
    Floating.useRole(context, { role: "tooltip" }),
  ]);

  return (
    <>
      <span
        className={`flashlight-token ${hasTooltip ? "has-tooltip" : ""}`}
        ref={(ref) => {
          refs.setReference(ref);
        }}
        {...getReferenceProps()}
      >
        {trimmed}
      </span>
      {hasTooltip && tooltipActive && (
        <div
          className="flashlight-tooltip"
          ref={(ref) => {
            refs.setFloating(ref);
          }}
          style={floatingStyles}
          {...getFloatingProps()}
        >
          {phrases.map(({ end, phrase, matches }) => (
            <div key={end} className="flashlight-tooltip-item">
              <span className="flashlight-tooltip-phrase">{phrase}:</span>{" "}
              {matches
                .map((match) => `${match.type} (${String(match.score)})`)
                .join(", ")}
            </div>
          ))}
        </div>
      )}
      {text.slice(trimmed.length)}
    </>
  );
}

function FlashlightOutput() {
  const lemmatized = useStore((state) => state.lemmatizedMatcherInput);
  const output = useStore((state) => state.matcherOutput);

  return (
    <div className="flashlight-output">
      {lemmatized.map((line, i) => (
        <div className="flashlight-line" key={i}>
          {line.map((token, j) => (
            <FlashlightToken
              key={j}
              text={token.text}
              phrases={groupMatches(line, output[i] ?? [], j)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Flashlight() {
  const matcherInput = useStore((state) => state.matcherInput);
  const setMatcherInput = useStore((state) => state.setMatcherInput);
  const sendMatcherInput = useStore((state) => state.sendMatcherInput);

  return (
    <div className="flashlight">
      <div className="flashlight-input">
        <textarea
          value={matcherInput}
          onChange={(e) => {
            setMatcherInput(e.target.value);
          }}
        />
        <button
          onClick={() => {
            sendMatcherInput();
          }}
        >
          light
        </button>
      </div>
      <FlashlightOutput />
    </div>
  );
}
