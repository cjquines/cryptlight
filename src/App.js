import React from "react";
import { loadData, getRanges } from "./cryptlight";
import "./App.scss";

function App() {
  React.useEffect(() => {
    const init = async () => {
      const data = await loadData();
      getRanges(
        data,
        "5. Backing alpha crazy what half-hearted gets tattoo of going the final weapon in Clue (5)"
      );
    };
    init();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
