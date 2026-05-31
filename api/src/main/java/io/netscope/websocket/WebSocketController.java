package io.netscope.websocket;

import io.netscope.common.errors.ApiException;
import io.netscope.common.security.TargetValidator;
import io.netscope.common.observability.ToolMetrics;
import org.springframework.web.bind.annotation.*;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * WebSocket reachability + handshake probe.
 *
 * Opens a real client WebSocket connection against the target URL, captures
 * the handshake latency, the server's upgrade response (or close-code on
 * rejection), then exercises the ping/pong round-trip — exactly the round
 * a real ws client does at connection time. Closes cleanly afterwards.
 *
 * SSRF: the host portion of the URL is sent through {@link TargetValidator}
 * (same gate the other tools use) before the WebSocket client is built,
 * so an attacker cannot point us at a loopback or cloud-metadata address.
 *
 * Why this is its own controller and not part of /reach: the existing
 * reachability tool only does TCP / HTTP probes — neither performs the
 * WebSocket-specific upgrade handshake. A TCP-open port reports nothing
 * about whether the server actually serves a WebSocket on it.
 */
@RestController
@RequestMapping("/api/v1/websocket")
public class WebSocketController {

    /** Wall-clock budget for the whole probe (connect + ping + close). */
    private static final Duration TOTAL_BUDGET = Duration.ofSeconds(8);
    /** Per-step timeout: how long we wait for handshake or pong. */
    private static final Duration STEP_TIMEOUT = Duration.ofSeconds(4);

    private final TargetValidator validator;

    /** Shared HttpClient. Re-using one instance across probes keeps the
     *  per-request cost flat — the previous per-probe
     *  {@code HttpClient.newBuilder().build()} leaked a NIO selector
     *  thread per call (HttpClient is AutoCloseable in JDK 21 but the
     *  controller never called close()). A single shared instance is
     *  safe: HttpClient is documented as thread-safe and reusing it
     *  is the recommended idiom.
     *
     *  Holder-class indirection: lazy class init means the underlying
     *  NIO selector is built on first probe, not at controller
     *  construction. The input-validation unit tests instantiate the
     *  controller without ever calling probe(), so they no longer pay
     *  for selector setup — which is the path that fails to open a
     *  loopback pipe in sandboxed JDK 25 / Windows test envs. */
    private static final class Http {
        static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(STEP_TIMEOUT)
            .build();
    }

    private final ToolMetrics metrics;

    public WebSocketController(TargetValidator validator, ToolMetrics metrics) {
        this.validator = validator;
        this.metrics = metrics;
    }

    @GetMapping
    public Map<String, Object> probe(
            @RequestParam String url,
            @RequestParam(required = false) String subprotocol) {
        return metrics.record("websocket", "probe", () -> probeInternal(url, subprotocol));
    }

    private Map<String, Object> probeInternal(String url, String subprotocol) {
        // Validate subprotocol FIRST so a malformed token returns 400
        // without paying the cost of DNS resolution / SSRF lookup. This
        // also means unit tests can exercise the subprotocol-rejection
        // path in an offline sandbox where parseAndValidate would
        // otherwise throw "could not resolve" before we even reach the
        // subprotocol regex.
        if (subprotocol != null && !subprotocol.isBlank()
            && !subprotocol.matches("^[a-zA-Z0-9._+,/-]{1,128}$")) {
            throw ApiException.badRequest("invalid subprotocol token");
        }

        ValidatedWsTarget target = parseAndValidate(url);
        URI uri = target.uri();

        long t0 = System.currentTimeMillis();
        var builder = Http.CLIENT.newWebSocketBuilder()
            .connectTimeout(STEP_TIMEOUT)
            .header("User-Agent", "NetScope/1.0 (WS probe)");
        if (subprotocol != null && !subprotocol.isBlank()) {
            builder.subprotocols(subprotocol);
        }

        // F-04: close the DNS-rebinding TOCTOU window. The validator
        // resolved `target.host()` to `target.addr()` and verified the
        // address is not internal — but java.net.http.WebSocket would
        // otherwise re-resolve the hostname at buildAsync() time, and a
        // low-TTL attacker resolver could swap the second response to
        // 127.0.0.1 (or 169.254.169.254 etc.) to leak internal-service
        // banners / responses. By rewriting the connect URI to the
        // already-validated IP literal we make the JDK skip the second
        // DNS lookup entirely.
        //
        // Trade-off (documented): java.net.http.WebSocket.Builder.header()
        // rejects "Host" as a restricted header, so we cannot keep the
        // original hostname in the Host header / TLS SNI. For wss:// the
        // server may return its default vhost / certificate instead of
        // the one matching the original hostname. That's acceptable for
        // a reachability/handshake probe — the security gain (no SSRF
        // via rebind) outweighs the loss of vhost fidelity.
        URI connectUri = rewriteHostToLiteral(uri, target.addr());
        ProbeListener listener = new ProbeListener();
        WebSocket ws;
        try {
            CompletableFuture<WebSocket> f = builder.buildAsync(connectUri, listener);
            ws = f.get(STEP_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            return failure(uri, t0, "handshake timed out", null);
        } catch (Exception e) {
            // Wrapped CompletionException → unwrap to get the real cause.
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            return failure(uri, t0, cause.getClass().getSimpleName(),
                cause.getMessage());
        }

        long handshakeMs = System.currentTimeMillis() - t0;

        // ── Ping/pong RTT ─────────────────────────────────────────────────
        long pingRttMs = -1;
        try {
            long pingStart = System.currentTimeMillis();
            ByteBuffer payload = ByteBuffer.wrap(("netscope-" + pingStart).getBytes());
            ws.sendPing(payload).get(STEP_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            // The Listener captures pong arrival time.
            listener.awaitPong(STEP_TIMEOUT);
            if (listener.pongReceivedAtMs.get() > 0) {
                pingRttMs = listener.pongReceivedAtMs.get() - pingStart;
            }
        } catch (Exception ignored) {
            // Some servers don't respond to client-initiated pings — that's
            // not a probe failure, just an empty RTT measurement.
        }

        // Close cleanly with 1000 Normal Closure.
        try {
            ws.sendClose(WebSocket.NORMAL_CLOSURE, "probe done")
                .get(STEP_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (Exception ignored) { /* best effort */ }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("url", uri.toString());
        out.put("host", uri.getHost());
        out.put("scheme", uri.getScheme());
        out.put("ok", true);
        out.put("handshakeLatencyMs", handshakeMs);
        out.put("pingRttMs", pingRttMs);
        out.put("subprotocol", ws.getSubprotocol());
        // closeStatus / closeReason are populated by onClose when (and
        // only when) the server replies to our sendClose with its own
        // close frame within STEP_TIMEOUT. They are null when:
        //   • the server simply ack'd our close at the TCP layer without
        //     a matching WebSocket close frame, or
        //   • our sendClose completed but no close frame arrived in time.
        // Both are valid outcomes — the front-end conditionally hides
        // the row when the value is null rather than rendering "—".
        out.put("closeStatusCode", listener.closeStatus.get());
        out.put("closeReason", listener.closeReason.get());
        out.put("totalDurationMs", System.currentTimeMillis() - t0);
        return out;
    }

    /** Result of URL parsing + SSRF validation. Carries the original URI
     *  (for response logging — the user sees the URL they typed), the
     *  validated InetAddress (so the connect site can dial it directly
     *  without a second DNS lookup — see F-04), and the original
     *  hostname (kept for visibility and any future Host-header use). */
    record ValidatedWsTarget(URI uri, InetAddress addr, String host) {}

    private ValidatedWsTarget parseAndValidate(String raw) {
        URI uri;
        try {
            uri = new URI(raw);
        } catch (URISyntaxException e) {
            throw ApiException.badRequest("invalid URL");
        }
        String scheme = uri.getScheme();
        if (scheme == null
            || !(scheme.equalsIgnoreCase("ws") || scheme.equalsIgnoreCase("wss"))) {
            throw ApiException.badRequest("URL must use ws:// or wss://");
        }
        String host = uri.getHost();
        if (host == null) throw ApiException.badRequest("URL is missing host");
        // SSRF: hand the host through the canonical validator. It throws
        // 400/403 on internal targets — propagate unchanged. F-04: KEEP
        // the validated InetAddress (the previous version discarded it
        // and let WebSocket.Builder re-resolve at connect time, opening
        // a DNS-rebinding TOCTOU window).
        InetAddress addr = validator.resolveAndValidate(host);
        return new ValidatedWsTarget(uri, addr, host);
    }

    /** Rebuild {@code uri} with its host portion replaced by the literal
     *  form of {@code addr}, preserving scheme, port, path, query and
     *  fragment. IPv6 literals are bracketed per RFC 3986 §3.2.2 so the
     *  resulting URI parses correctly (e.g. {@code wss://[::1]:443/x}). */
    private static URI rewriteHostToLiteral(URI uri, InetAddress addr) {
        String literal = addr.getHostAddress();
        if (addr instanceof Inet6Address) {
            // Strip any zone-id ("%eth0"), which is meaningless across
            // hosts and breaks URI parsing.
            int zone = literal.indexOf('%');
            if (zone >= 0) literal = literal.substring(0, zone);
            literal = "[" + literal + "]";
        }
        try {
            // Build the authority manually rather than calling the
            // 7-arg URI constructor with userInfo+host+port — that
            // overload re-escapes IPv6 brackets and treats them as
            // forbidden authority chars.
            StringBuilder authority = new StringBuilder();
            if (uri.getRawUserInfo() != null) {
                authority.append(uri.getRawUserInfo()).append('@');
            }
            authority.append(literal);
            if (uri.getPort() != -1) {
                authority.append(':').append(uri.getPort());
            }
            String rawPath = uri.getRawPath();
            String rawQuery = uri.getRawQuery();
            String rawFragment = uri.getRawFragment();
            StringBuilder out = new StringBuilder();
            out.append(uri.getScheme()).append("://").append(authority);
            if (rawPath != null && !rawPath.isEmpty()) out.append(rawPath);
            if (rawQuery != null) out.append('?').append(rawQuery);
            if (rawFragment != null) out.append('#').append(rawFragment);
            return new URI(out.toString());
        } catch (URISyntaxException e) {
            // Shouldn't happen — the inputs come from an already-valid
            // URI plus a well-formed IP literal — but if it does, fall
            // back to the original. The validator already confirmed
            // the address is safe, so the worst case here is a
            // DNS-rebind window equivalent to the pre-fix behaviour.
            return uri;
        }
    }

    private static Map<String, Object> failure(URI uri, long startMs, String error, String detail) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("url", uri.toString());
        out.put("host", uri.getHost());
        out.put("scheme", uri.getScheme());
        out.put("ok", false);
        out.put("error", error);
        if (detail != null) out.put("detail", detail);
        out.put("totalDurationMs", System.currentTimeMillis() - startMs);
        return out;
    }

    /** Captures pong arrival + close-frame metadata. Text/binary frames are
     *  ignored on purpose — this probe is upgrade-only. */
    private static final class ProbeListener implements WebSocket.Listener {
        final AtomicLong pongReceivedAtMs = new AtomicLong(0);
        final AtomicReference<Integer> closeStatus = new AtomicReference<>();
        final AtomicReference<String> closeReason = new AtomicReference<>();
        private final java.util.concurrent.CountDownLatch pongLatch =
            new java.util.concurrent.CountDownLatch(1);

        @Override
        public CompletableFuture<?> onPong(WebSocket ws, ByteBuffer msg) {
            pongReceivedAtMs.set(System.currentTimeMillis());
            pongLatch.countDown();
            ws.request(1);
            return null;
        }

        @Override
        public CompletableFuture<?> onClose(WebSocket ws, int statusCode, String reason) {
            closeStatus.set(statusCode);
            closeReason.set(reason);
            pongLatch.countDown(); // unblock any waiting pong-wait
            return null;
        }

        void awaitPong(Duration timeout) throws InterruptedException {
            pongLatch.await(timeout.toMillis(), TimeUnit.MILLISECONDS);
        }
    }
}
