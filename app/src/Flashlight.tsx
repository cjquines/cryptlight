import * as Floating from "@floating-ui/react";
import type { IndicatorMatch } from "cryptlight";
import { useState } from "react";
import "./Flashlight.css";
import { useStore } from "./store";

function FlashlightToken({
  text,
  matches,
}: {
  text: string;
  matches: IndicatorMatch[];
}) {
  const trimmed = text.trim();
  const hasTooltip = matches.length > 0;
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
          {matches.map((match, i) => (
            <div key={i} className="flashlight-tooltip-item">
              {match.type} ({match.score})
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
              matches={
                output[i]?.filter(
                  (match) => match.start === j && match.end === j,
                ) ?? []
              }
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
