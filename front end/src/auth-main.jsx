import React from "react";
import { createRoot } from "react-dom/client";
import AuthApp from "./AuthApp.jsx";
import CursorHalo from "./CursorHalo.jsx";
import "./styles.css";
import "./auth.css";
createRoot(document.getElementById("root")).render(
  <>
    <AuthApp />
    <CursorHalo />
  </>,
);
