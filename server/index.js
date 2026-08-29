// Entry point for the ghost-race relay (PLAT-20). Run locally with
// `node index.js` (or `npm start`); deployed to a Node host in PLAT-27.
import { createRelayServer, PRODUCTION_ORIGIN } from "./relay.js";

const port = Number(process.env.PORT) || 3001;

// Comma-separated exact origins. Leave it unset and the relay falls back to
// its built-in policy (the deployed site plus local/LAN development origins)
// rather than the `*` it used to accept (#145).
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

createRelayServer({ port, allowedOrigins }).then(({ port: p }) => {
  /* eslint-disable no-console */
  console.log(`ghost-race relay listening on :${p}`);
  // Printed on every boot so the effective policy is visible in the host's
  // logs. A misconfigured deploy used to be silently wide open; now the
  // worst case is silently *narrower* than intended, which shows up as
  // players unable to connect rather than as an open door.
  if (allowedOrigins) {
    console.log(`CORS: allowing exactly [${allowedOrigins.join(", ")}]`);
  } else {
    console.log(
      `CORS: ALLOWED_ORIGINS unset — allowing ${PRODUCTION_ORIGIN} and ` +
        `local/private-network origins. Set ALLOWED_ORIGINS to pin this.`,
    );
  }
  /* eslint-enable no-console */
});
