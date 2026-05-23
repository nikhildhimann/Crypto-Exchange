// Refactor: keeps the existing entrypoint while mounting the app inside the Redux-backed provider shim.
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppProvider } from "./store/AppProvider";
import "./styles/index.css";
import "./App.css";

createRoot(document.getElementById("root")).render(
  <AppProvider>
    <App />
  </AppProvider>,
);
