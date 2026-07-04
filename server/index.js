// Entry point for the ghost-race relay (PLAT-20). Run locally with
// `node index.js` (or `npm start`); deployed to a Node host in PLAT-27.
import { createRelayServer } from "./relay.js";

const port = Number(process.env.PORT) || 3001;
// Comma-separated allowlist; "*" (default) is fine for local dev.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : "*";

createRelayServer({ port, allowedOrigins }).then(({ port: p }) => {
  // eslint-disable-next-line no-console
  console.log(`ghost-race relay listening on :${p}`);
});
