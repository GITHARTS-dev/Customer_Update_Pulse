import React from "react";
import ReactDOM from "react-dom/client";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import App from "./App.jsx";
import { msalConfig } from "./authConfig.js";
import "./styles.css";

const msalInstance = new PublicClientApplication(msalConfig);

msalInstance.initialize().then(() => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  );
});
