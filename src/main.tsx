import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Toaster } from "./components/Toaster";
import { PreferencesDialog } from "./components/PreferencesDialog";
import { TofuPromptDialog } from "./components/TofuPromptDialog";
import { TransferHistoryMount } from "./components/TransferHistoryPanel";
import { AutoReconnectMount } from "./hooks/useAutoReconnect";
import { TransferNotificationsMount } from "./hooks/useTransferNotifications";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <Toaster />
    <PreferencesDialog />
    <TofuPromptDialog />
    <TransferHistoryMount />
    <AutoReconnectMount />
    <TransferNotificationsMount />
  </React.StrictMode>,
);
