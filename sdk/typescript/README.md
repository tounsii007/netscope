# @netscope/sdk

TypeScript client for the NetScope network diagnostics API. Zero dependencies,
types for every endpoint, built-in retry with exponential backoff.

```bash
npm install @netscope/sdk
```

## Usage

```ts
import { NetScope, NetScopeError } from "@netscope/sdk";

const ns = new NetScope({ apiKey: process.env.NETSCOPE_API_KEY });

try {
  const r = await ns.port.check({ target: "mydomain.com", port: 443 });
  if (!r.open) throw new Error(`443 closed (${r.error})`);

  const ssl = await ns.ssl.grade("mydomain.com");
  if (ssl.grade !== "A+" && ssl.grade !== "A") {
    console.warn("SSL grade regressed:", ssl.grade, ssl.findings);
  }

  const monitors = await ns.monitors.list();
  console.log(`${monitors.length} monitors active`);
} catch (e) {
  if (e instanceof NetScopeError) {
    console.error(`API ${e.status}: ${e.message}`);
  } else throw e;
}
```

## Options

```ts
new NetScope({
  baseUrl: "https://api.netscope.io",  // override for self-hosted
  apiKey: "netscope_live_...",
  timeoutMs: 30_000,
  retries: 2,                          // exponential backoff on 429/5xx
  fetch: globalThis.fetch,             // swap in undici / msw for tests
});
```

## Error handling

All non-2xx responses throw `NetScopeError` with `.status` and `.body`.
Network timeouts throw `DOMException` with name `AbortError`.
