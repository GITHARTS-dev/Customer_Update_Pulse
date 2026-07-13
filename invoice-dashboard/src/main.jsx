import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// No MSAL here anymore. Auth is unified at the HARTS launchpad: reaching
// /invoice already required a NextAuth sign-in, and Graph is read through a
// same-origin server proxy that uses that session. So this SPA just renders.
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
