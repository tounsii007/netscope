"""One-shot helper: add i18n entries for the four new tools (DKIM,
CT logs, DoH, WebSocket) to web/messages/en.json.

Idempotent — re-running it on a file that already has the entries just
overwrites them with the same values. Other 10 locale bundles get the EN
strings as a temporary fallback (the translation team replaces them when
they pick up the keys).
"""
import json
from pathlib import Path

ROOT = Path(r"C:/projects/netscope/web/messages")

NAV_LABELS = {
    "dkim":      "DKIM Key Fetcher",
    "ct_logs":   "CT Log Search",
    "doh":       "DoH / DoT Tester",
    "websocket": "WebSocket Probe",
}

CLIENT_NS = {
    "dkim": {
        "placeholder_domain":   "example.com",
        "placeholder_selector": "DKIM selector (optional)",
        "selector_hint":        "Leave blank to probe common selectors: google, selector1, k1, mail, default ...",
        "found_at_selector":    "DKIM key found at selector \"{selector}\"",
        "not_found":            "No DKIM record found",
        "tried_selectors":      "Tried selectors:",
        "revoked":              "revoked",
        "raw_record_at":        "Raw record at {host}",
        "key_algorithm":        "Key algorithm",
        "key_size":             "Key size",
        "bits":                 "bits",
        "hash_algorithms":      "Hash algorithms",
        "service_type":         "Service type",
    },
    "ct_logs": {
        "placeholder_domain":   "github.com",
        "include_subdomains":   "Include subdomains",
        "exclude_expired":      "Hide expired certificates",
        "certificates_for":     "certificates for {domain}",
        "certificates":         "Certificates",
        "issuers":              "Issuers by count",
        "issuer":               "Issuer",
        "not_before":           "Valid from",
        "not_after":            "Valid to",
        "valid_for":            "Valid for",
        "days":                 "days",
        "n_sans":               "{n} SANs (click to expand)",
        "truncated":            "truncated",
        "expires_in_n_days":    "expires in {n} days",
        "expired_n_days_ago":   "expired {n} days ago",
    },
    "doh": {
        "placeholder_domain":   "cloudflare.com",
        "answers_consistent":   "All resolvers returned the same answer set",
        "answers_diverge":      "Resolvers returned {count} distinct answer sets - investigate",
        "ok":                   "OK",
        "failed":               "failed",
        "port_reachable":       "port reachable",
        "blocked":              "blocked",
    },
    "websocket": {
        "placeholder_url":          "wss://echo.websocket.events",
        "placeholder_subprotocol":  "subprotocol (optional)",
        "subprotocol_hint":         "Optional Sec-WebSocket-Protocol token, e.g. \"mqtt\" or \"graphql-ws\".",
        "handshake_ok":             "Handshake succeeded",
        "handshake_failed":         "Handshake failed",
        "host":                     "Host",
        "scheme":                   "Scheme",
        "handshake_latency":        "Handshake latency",
        "ping_rtt":                 "Ping RTT",
        "no_pong":                  "no pong (server did not respond)",
        "subprotocol_negotiated":   "Subprotocol",
        "close_status":             "Close status",
    },
}

TOOLS_META = {
    "dkim": {
        "title": "DKIM Key Fetcher",
        "desc":  "Fetch and grade the published DKIM public key for any domain + selector.",
        "meta_title":       "DKIM Key Fetcher - Public key + algorithm + warnings",
        "meta_description": "Look up the DKIM public key any sender publishes for a domain. Reports key algorithm, bit length, hash algorithms, and warnings for weak / revoked / SHA-1-only setups.",
        "explainer": {
            "purpose":      "The DKIM Key Fetcher resolves the TXT record at <selector>._domainkey.<domain>, parses it, and reports the public key + algorithm + size + flagged weaknesses. Distinct from the broader Email Authentication audit which only checks DKIM presence.",
            "how_it_works": "Probes common selectors (google, selector1, k1, mail, default, ...) until one returns a DKIM record.\nDecodes the base64-encoded public key, derives bit length (RSA modulus / Ed25519 fixed 256).\nFlags revoked keys (empty p=), test mode (t=y), SHA-1-only declarations.",
            "when_to_use":  "Verify a freshly rotated DKIM key matches what your signer produced.\nDiagnose verification failures by inspecting key size and declared hash algorithms.\nAudit third-party mail senders for SHA-256 support and adequate key strength.",
            "limits":       "Cannot detect whether a key is actually being used to sign outbound mail - only that it is published in DNS.\nDoes not verify the private-key half (server-side only).",
        },
    },
    "ct-logs": {
        "title": "CT Log Search",
        "desc":  "Find every certificate issued for a domain via Certificate Transparency logs.",
        "meta_title":       "CT Log Search - Find every certificate issued for any domain",
        "meta_description": "Search Certificate Transparency logs (crt.sh) for any domain. See issuer CA, SANs, validity window, and detect unauthorised certificates issued in your name.",
        "explainer": {
            "purpose":      "CT Log Search queries the public Certificate Transparency ecosystem for every TLS certificate ever issued covering a domain. Use it to detect mis-issuance, find subdomains attackers may have stood up, and audit which CAs have signed for a brand over time.",
            "how_it_works": "Queries crt.sh (run by Sectigo) for all CT log entries matching the domain - optionally including subdomains via a wildcard query.\nNormalises each row to issuer + SANs + dates + computed expiry, then sorts newest-first and rolls up an issuer summary.",
            "when_to_use":  "Detect a CA that issued a certificate for your domain without authorisation.\nFind subdomains an attacker registered against a brand or product name.\nAudit the history of CAs and key types deployed by a public service.",
            "limits":       "Coverage depends on crt.sh and its upstream CT logs - recent precertificates may not yet be visible.\nResults are capped at 200 entries; popular root domains may have many thousands.",
        },
    },
    "doh": {
        "title": "DoH / DoT Tester",
        "desc":  "Resolve any name across five public encrypted-DNS providers and compare answers.",
        "meta_title":       "DoH / DoT Tester - Compare encrypted DNS resolvers",
        "meta_description": "Test DNS-over-HTTPS and DNS-over-TLS at Cloudflare, Google, Quad9, AdGuard, NextDNS in parallel. Compare answers, latencies, and port reachability.",
        "explainer": {
            "purpose":      "The DoH / DoT Tester sends the same query to five major encrypted-DNS providers in parallel and compares answers + latency. Useful for spotting split-horizon results, diagnosing per-provider outages, and confirming outbound 853/TCP is not blocked.",
            "how_it_works": "For each provider it runs a DoH lookup over RFC 8484 (dns-query endpoint) and a separate TCP probe on port 853 (DoT reachability).\nAnswers are normalised + sorted; if any two providers disagree, the result is flagged as inconsistent.",
            "when_to_use":  "Verify your encrypted-DNS resolver setup works end-to-end.\nDiagnose whether a DNS hiccup is local, ISP-level, or upstream provider-side.\nDetect split-horizon DNS where you receive different answers than the public Internet does.",
            "limits":       "Only checks TCP reachability for DoT - does not run a full TLS handshake against the responder.\nAnswers are observed once; transient propagation differences may produce false \"inconsistent\" flags.",
        },
    },
    "websocket": {
        "title": "WebSocket Probe",
        "desc":  "Test a WebSocket endpoint: handshake, subprotocols, ping/pong RTT.",
        "meta_title":       "WebSocket Probe - Test wss:// endpoint handshake + RTT",
        "meta_description": "Probe a WebSocket endpoint with a real client handshake. Measures upgrade latency, captures negotiated subprotocols, runs a ping-pong RTT round trip.",
        "explainer": {
            "purpose":      "The WebSocket Probe opens a real client WebSocket connection against the target URL, captures the handshake latency and any negotiated subprotocols, then exercises ping/pong to measure server response RTT. Reaches further than a plain TCP port check because it actually completes the HTTP-upgrade step.",
            "how_it_works": "Uses the JDK 21 WebSocket client to open ws:// or wss://, with an SSRF guard on the target host.\nSends a client ping after the handshake and times the matching pong.\nCloses cleanly with code 1000 (Normal Closure) regardless of probe outcome.",
            "when_to_use":  "Verify a WebSocket endpoint is reachable through your edge / load balancer / WAF.\nReproduce a \"WS connection drops on first frame\" report from outside the customer network.\nDiagnose latency for real-time apps (chat, live dashboards) before users complain.",
            "limits":       "Does not send application-layer frames after the handshake - pure transport-layer probe.\nServers that refuse client-initiated pings will return no RTT (which is rendered as \"no pong\").",
        },
    },
}


def patch(path: Path) -> None:
    with path.open(encoding="utf-8") as f:
        d = json.load(f)
    # nav.tools
    d.setdefault("nav", {}).setdefault("tools", {}).update(NAV_LABELS)
    # client namespaces
    for ns, payload in CLIENT_NS.items():
        d[ns] = payload
    # tools.<slug> metadata
    d.setdefault("tools", {}).update(TOOLS_META)
    with path.open("w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)


def main() -> None:
    for json_path in sorted(ROOT.glob("*.json")):
        patch(json_path)
        print(f"patched {json_path.name}")


if __name__ == "__main__":
    main()
