import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import CursorHalo from "./CursorHalo.jsx";
import "./styles.css";
import "./workspace-polish.css";
createRoot(document.getElementById("root")).render(
  <>
    <App />
    <CursorHalo />
  </>,
);
