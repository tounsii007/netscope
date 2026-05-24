package io.netscope.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Wraps {@link java.net.http.HttpClient} with manual redirect handling
 * that re-runs {@link TargetValidator} on every hop. Prevents SSRF
 * where an attacker-controlled public host redirects to 127.0.0.1 or
 * cloud-metadata. Also blocks:
 *
 *   • Non-http(s) redirect schemes (file://, gopher://, jar:…).
 *     These are valid URI schemes the JDK URI parser accepts but
 *     would let an attacker reach arbitrary local resources.
 *   • https → http downgrades. Once a request is over TLS, a downgrade
 *     mid-flight is almost never intended and is a classic
 *     credential-stealing redirect-loop pattern.
 *   • Excessive redirect chains ({@link #MAX_REDIRECTS}).
 *   • Missing or unparseable Location headers — we surface the
 *     pre-redirect response in those cases instead of crashing.
 *
 * Why throw {@link ApiException} on bounded failures
 * ──────────────────────────────────────────────────
 * Callers expect a stable error contract. Throwing
 * {@code RuntimeException("too many redirects")} forced
 * {@link GlobalExceptionHandler#handleOther} to swallow it as a 500
 * with a correlation-id (correct for "unknown" but wrong here — the
 * cause is clearly a 4xx-class user/target problem). The two named
 * failure modes ({@link ApiException.ErrorCode#UPSTREAM_ERROR},
 * {@link ApiException.ErrorCode#TARGET_BLOCKED}) let the frontend
 * branch on them and let the access-log capture the right severity.
 */
@Component
public class SafeHttpClient {

    private static final Logger log = LoggerFactory.getLogger(SafeHttpClient.class);

    /** Cap of consecutive Location follows; one full redirect chain. */
    private static final int MAX_REDIRECTS = 5;
    /** Per-request fall-back timeout when the caller didn't set one. */
    private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(10);

    private final HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        // We MUST handle redirects ourselves — the JDK's automatic
        // follower doesn't re-validate hosts mid-chain.
        .followRedirects(HttpClient.Redirect.NEVER)
        .version(HttpClient.Version.HTTP_2)
        .build();

    private final TargetValidator validator;

    public SafeHttpClient(TargetValidator validator) { this.validator = validator; }

    public <T> HttpResponse<T> send(HttpRequest initial, HttpResponse.BodyHandler<T> handler) throws Exception {
        HttpRequest req = initial;
        for (int i = 0; i <= MAX_REDIRECTS; i++) {
            // Re-validate on every hop; a DNS rebind would otherwise
            // slip through after the first lookup was cached.
            validator.resolveAndValidate(req.uri().getHost());

            HttpResponse<T> res = client.send(req, handler);
            int status = res.statusCode();
            if (status >= 300 && status < 400) {
                String location = res.headers().firstValue("location").orElse(null);
                if (location == null || location.isBlank()) {
                    // Redirect without a Location header is illegal HTTP
                    // but happens; return the 3xx so the caller can
                    // surface it as the actual result.
                    return res;
                }

                URI next;
                try {
                    next = req.uri().resolve(location);
                } catch (IllegalArgumentException | NullPointerException ex) {
                    // Malformed Location — keep the 3xx response.
                    log.debug("Unparseable Location header at {}: {}", req.uri(), location);
                    return res;
                }

                if (next.getHost() == null) {
                    // Same-path / fragment-only redirect with no host
                    // info. Treat as terminal.
                    return res;
                }

                // Enforce a safe scheme list — http and https only. URI
                // parser will happily accept file://, gopher://, jar:…
                // strings; we block them BEFORE hitting the network.
                String scheme = next.getScheme();
                if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
                    throw ApiException.targetBlocked("redirect to unsupported scheme: " + scheme);
                }

                // Block https → http downgrades. Once we negotiated TLS
                // we don't accept a plain-text follow — the redirector
                // is either malicious or misconfigured, both are user
                // surprises we shouldn't propagate.
                if ("https".equalsIgnoreCase(req.uri().getScheme()) && "http".equalsIgnoreCase(scheme)) {
                    throw ApiException.targetBlocked("redirect from https to http is blocked");
                }

                // Rebuild as GET with no body. The wrapped clients
                // never need to forward bodies through redirects today
                // — promote the call to POST-preserving 307/308 later
                // by inspecting `status` (307|308 → keep verb+body).
                req = HttpRequest.newBuilder(next)
                    .timeout(req.timeout().orElse(DEFAULT_TIMEOUT))
                    .header("User-Agent", "NetScope/1.0")
                    .method("GET", HttpRequest.BodyPublishers.noBody())
                    .build();
                continue;
            }
            return res;
        }
        throw ApiException.upstreamError("too many redirects (limit " + MAX_REDIRECTS + ")");
    }
}
