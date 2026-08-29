// Origin policy on the relay (#145).
//
// The relay used to accept any origin unless ALLOWED_ORIGINS happened to be
// set on the host, and echoed whatever Origin it was given back on /health.
// Nothing in the repo asserted the variable was set, so the deployed default
// was invisible from here — and it was `*`.
//
// Refusing to boot without the variable, which the issue floated, would take
// the live relay down on the next deploy if it has never been set. The
// fallback is a real allowlist instead, so these tests care as much about
// what still connects as about what no longer does.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient } from "socket.io-client";
import { createRelayServer, makeOriginAllowed, PRODUCTION_ORIGIN } from "./relay.js";

describe("default policy (ALLOWED_ORIGINS unset)", () => {
  const allowed = makeOriginAllowed(undefined);

  it("accepts the deployed site", () => {
    expect(allowed(PRODUCTION_ORIGIN)).toBe(true);
  });

  it("accepts local development on any port", () => {
    for (const origin of [
      "http://localhost:5173",   // vite dev
      "http://localhost:4173",   // vite preview
      "http://127.0.0.1:3000",
      "http://[::1]:5173",
      "http://my-macbook.local:5173",
    ]) {
      expect(allowed(origin), origin).toBe(true);
    }
  });

  it("accepts private-network origins, so phone testing over the LAN works", () => {
    // The client's isLocalNetworkHost permits these, so the server must too
    // or device testing against a dev server breaks.
    for (const origin of [
      "http://192.168.1.24:5173",
      "http://10.0.0.5:5173",
      "http://172.16.3.4:5173",
    ]) {
      expect(allowed(origin), origin).toBe(true);
    }
  });

  it("refuses everything else", () => {
    for (const origin of [
      "https://evil.example",
      "https://greentea524.github.io.evil.example",
      "http://greentea524.github.io",       // wrong scheme
      "https://8.8.8.8",
      "http://172.15.0.1:5173",             // just outside 172.16/12
      "http://172.32.0.1:5173",             // just above it
      "not a url",
    ]) {
      expect(allowed(origin), origin).toBe(false);
    }
  });

  it("allows a request with no Origin at all", () => {
    // curl, a native client, and — the reason this matters — the host's own
    // health probe. CORS protects browsers from other pages; there is no
    // browser here to protect.
    expect(allowed(undefined)).toBe(true);
    expect(allowed("")).toBe(true);
  });
});

describe("explicit ALLOWED_ORIGINS", () => {
  const allowed = makeOriginAllowed(["https://example.com"]);

  it("matches exactly and nothing else", () => {
    expect(allowed("https://example.com")).toBe(true);
    expect(allowed("https://example.com.evil.test")).toBe(false);
    expect(allowed(PRODUCTION_ORIGIN)).toBe(false);
    expect(allowed("http://localhost:5173")).toBe(false);
  });

  it("still allows an origin-less request", () => {
    expect(allowed(undefined)).toBe(true);
  });
});

describe("the health route stops reflecting arbitrary origins", () => {
  let server, url;
  beforeAll(async () => {
    server = await createRelayServer({ port: 0, allowedOrigins: ["https://example.com"] });
    url = `http://127.0.0.1:${server.port}`;
  });
  afterAll(async () => await server.close());

  it("echoes an allowed origin", async () => {
    const res = await fetch(`${url}/health`, { headers: { Origin: "https://example.com" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://example.com");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("sends no CORS header for a disallowed origin", async () => {
    const res = await fetch(`${url}/health`, { headers: { Origin: "https://evil.example" } });
    // The body still returns — this is a health check, and the host may poll
    // it without an Origin — but the browser gets no permission to read it.
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers the host's own probe, which sends no Origin", async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("applies the same rule to preflight", async () => {
    const bad = await fetch(`${url}/anything`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    expect(bad.status).toBe(204);
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();

    const good = await fetch(`${url}/anything`, {
      method: "OPTIONS",
      headers: { Origin: "https://example.com" },
    });
    expect(good.headers.get("access-control-allow-origin")).toBe("https://example.com");
  });
});

describe("socket connections still work", () => {
  let server, url;
  beforeAll(async () => {
    server = await createRelayServer({ port: 0 });
    url = `http://127.0.0.1:${server.port}`;
  });
  afterAll(async () => await server.close());

  it("connects from a non-browser client (no Origin header)", async () => {
    const socket = ioClient(url, { transports: ["websocket"] });
    await new Promise((resolve, reject) => {
      socket.on("connect", resolve);
      socket.on("connect_error", reject);
      setTimeout(() => reject(new Error("timed out")), 2000);
    });
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });
});
