import React from "react";
import Mark from "mark.js";
import ReactTooltip from "react-tooltip";
import { nanoid } from "nanoid";
import { loadData, getRanges } from "./cryptlight";
import "./App.scss";

function App() {
  const data = React.useRef(null);
  const cluesElt = React.useRef(null);
  const [clues, setClues] = React.useState(
    "36. Firm deal closer rejects hot sushi accompaniment" +
      "\n" +
      "8. Announcer Hall initially emulates Dr. Demento"
  );

  React.useEffect(() => (async () => (data.current = await loadData()))(), []);

  const resolveClue = (text, i) => {
    const marker = new Mark(cluesElt.current.children[i]);
    getRanges(data.current, text).forEach(({ range, label }) => {
      const id = nanoid();
      marker.markRanges([range], { className: id });
      const elt = document.getElementsByClassName(id)[0];
      elt.setAttribute("data-tip", label);
    });
    ReactTooltip.rebuild();
  };

  const onSubmit = (e) => {
    e.preventDefault();
    clues.split("\n").forEach((text, i) => resolveClue(text, i));
  };

  const onChange = (e) => {
    const marker = new Mark(cluesElt.current);
    marker.unmark();
    setClues(e.target.value);
  };

  return (
    <div className="App">
      <form onSubmit={onSubmit}>
        <textarea onChange={onChange} type="text" value={clues} />
        <button type="submit">Submit</button>
      </form>
      <div ref={cluesElt}>
        {clues.split("\n").map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
      <ReactTooltip place="bottom" multiline={true} />
    </div>
  );
}

export default App;
