import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import "./styles.css";
import "bootstrap/dist/css/bootstrap.min.css";
// Was a <link> to maxcdn.bootstrapcdn.com, a retired BootstrapCDN host,
// with no integrity attribute. Only this entry renders `fa fa-*` icons —
// the four game entries use none — so it is imported here rather than in
// a shell every page loads.
import "font-awesome/css/font-awesome.min.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
