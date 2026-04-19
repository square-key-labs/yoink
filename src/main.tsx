import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Toaster } from "./components/Toaster";
import { PreferencesDialog } from "./components/PreferencesDialog";
import { AutoReconnectMount } from "./hooks/useAutoReconnect";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <Toaster />
    <PreferencesDialog />
    <AutoReconnectMount />
  </React.StrictMode>,
);
