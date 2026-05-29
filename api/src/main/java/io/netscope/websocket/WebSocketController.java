package io.netscope.websocket;

import io.netscope.common.ApiException;
import io.netscope.common.security.TargetValidator;
import io.netscope.common.ToolMetrics;
import org.springframework.web.bind.annotation.*;

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
     *  is the recommended idiom. */
    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(STEP_TIMEOUT)
        .build();

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

        URI uri = parseAndValidate(url);

        long t0 = System.currentTimeMillis();
        var builder = httpClient.newWebSocketBuilder()
            .connectTimeout(STEP_TIMEOUT)
            .header("User-Agent", "NetScope/1.0 (WS probe)");
        if (subprotocol != null && !subprotocol.isBlank()) {
            builder.subprotocols(subprotocol);
        }

        ProbeListener listener = new ProbeListener();
        WebSocket ws;
        try {
            CompletableFuture<WebSocket> f = builder.buildAsync(uri, listener);
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

    private URI parseAndValidate(String raw) {
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
        // 400/403 on internal targets — propagate unchanged.
        validator.resolveAndValidate(host);
        return uri;
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
