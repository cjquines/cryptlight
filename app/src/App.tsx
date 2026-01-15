import { useEffect, useState } from "react";
import "./App.css";
import { Flashlight } from "./Flashlight.tsx";
import { useStore } from "./store.ts";

export default function App() {
  const [mode, setMode] = useState<"flashlight" | "cryptflow">("flashlight");
  const initWorker = useStore((state) => state.initWorker);

  useEffect(() => {
    initWorker();
  }, [initWorker]);

  return (
    <div className="app">
      <div className="header">
        <h1>cryptlight</h1>
        <div style={{ flexGrow: 1 }} />
        <button
          className={`secondary ${mode === "cryptflow" ? "active" : ""}`}
          onClick={() => {
            setMode("cryptflow");
          }}
        >
          cryptflow
        </button>
        <button
          className={`secondary ${mode === "flashlight" ? "active" : ""}`}
          onClick={() => {
            setMode("flashlight");
          }}
        >
          flashlight
        </button>
      </div>
      <div>
        <Flashlight />
      </div>
    </div>
  );
}
