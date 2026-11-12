import React from "react";
import ReactDOM from "react-dom/client";
import { prefetchStartup } from "./shared/ipc";
import { isAndroid } from "./shared/platform";
import { App } from "./app/App";
import "./index.css";

// The saved state is on its way while React renders; `App` claims it when it mounts.
prefetchStartup();

if (isAndroid()) document.documentElement.dataset.platform = "android";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
