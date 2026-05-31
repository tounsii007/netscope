package io.netscope.common.http;
import io.netscope.common.security.TargetValidator;
import io.netscope.common.errors.ApiException;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Wraps java.net.http.HttpClient with manual redirect handling that re-runs
 * TargetValidator on every hop. Prevents SSRF where an attacker-controlled
 * public host redirects to 127.0.0.1 or cloud metadata.
 *
 * <p>Also enforces a hard {@link #MAX_BODY_BYTES} cap on the response body to
 * prevent resource exhaustion: a streaming counter wraps the caller's
 * BodySubscriber and cancels (with an IOException) once the cumulative byte
 * count exceeds the cap. A Content-Length pre-check short-circuits oversized
 * responses before any bytes are buffered. Chunked / unknown-length responses
 * are policed via the streaming counter.
 *
 * <p>F-RD2-05: previously the javadoc claimed a body-size cap but no code
 * enforced it, so callers like TechStackController buffered the full upstream
 * response into a String before any in-process truncation ran.
 */
@Component
public class SafeHttpClient {

    private static final int MAX_REDIRECTS = 5;
    private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(10);

    /**
     * Hard upstream-response cap (2 MB). Callers that need a tighter limit
     * (e.g. {@link io.netscope.pageinsight.PageFetcher} at 500 KB) can still
     * truncate further downstream; this cap is the upper safety bound for any
     * upstream we talk to.
     */
    public static final int MAX_BODY_BYTES = 2_000_000;

    /** TCP connect timeout for any outbound call routed through here. */
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);

    /** Default per-redirect-hop read timeout. Callers can override via
     *  {@code req.timeout()} on the outgoing {@link HttpRequest}. */
    private static final Duration DEFAULT_HOP_TIMEOUT = Duration.ofSeconds(10);

    private final HttpClient client = HttpClient.newBuilder()
        .connectTimeout(CONNECT_TIMEOUT)
        .followRedirects(HttpClient.Redirect.NEVER)
        .version(HttpClient.Version.HTTP_2)
        .build();

    private final TargetValidator validator;

    public SafeHttpClient(TargetValidator validator) { this.validator = validator; }

    public <T> HttpResponse<T> send(HttpRequest initial, HttpResponse.BodyHandler<T> handler) throws Exception {
        HttpRequest req = initial;
        for (int i = 0; i <= MAX_REDIRECTS; i++) {
            // Re-validate on every hop; a cached rebind would otherwise slip through.
            validator.resolveAndValidate(req.uri().getHost());
            // F-RD2-05: wrap the caller's handler so the body subscriber it
            // produces is policed by a byte counter. Content-Length is checked
            // before the inner subscriber is even built; chunked/unknown-length
            // responses are caught mid-stream by CountingBodySubscriber.
            HttpResponse<T> res = client.send(req, info -> {
                long declared = info.headers().firstValueAsLong("content-length").orElse(-1L);
                if (declared > MAX_BODY_BYTES) {
                    throw new UncheckedIOException(new IOException(
                        "response body exceeds " + MAX_BODY_BYTES + "-byte cap (content-length=" + declared + ")"));
                }
                HttpResponse.BodySubscriber<T> inner = handler.apply(info);
                return new CountingBodySubscriber<>(inner, MAX_BODY_BYTES);
            });
            int status = res.statusCode();
            if (status >= 300 && status < 400) {
                String location = res.headers().firstValue("location").orElse(null);
                if (location == null) return res;
                URI next = req.uri().resolve(location);
                if (next.getHost() == null) return res;
                req = HttpRequest.newBuilder(next)
                    .timeout(req.timeout().orElse(DEFAULT_HOP_TIMEOUT))
                    .header("User-Agent", "NetScope/1.0")
                    .method(req.method(), HttpRequest.BodyPublishers.noBody())
                    .build();
                continue;
            }
            return res;
        }
        throw new RuntimeException("too many redirects");
    }

    /**
     * Bridges {@link UncheckedIOException} thrown from the BodyHandler lambda
     * (the only place we can reject a response before subscribing) back into
     * the checked IOException that {@code HttpClient.send} already declares.
     */
    private static final class UncheckedIOException extends RuntimeException {
        UncheckedIOException(IOException cause) { super(cause); }
    }

    /**
     * BodySubscriber decorator that counts incoming bytes and cancels the
     * upstream subscription once the cumulative total exceeds {@code cap},
     * failing the returned body future with an {@link IOException}. The
     * inner subscriber sees only the bytes received before the cap was hit,
     * so partial buffers in e.g. {@code BodyHandlers.ofString()} are
     * discarded rather than surfaced to the caller.
     */
    private static final class CountingBodySubscriber<T> implements HttpResponse.BodySubscriber<T> {
        private final HttpResponse.BodySubscriber<T> inner;
        private final long cap;
        private final AtomicLong seen = new AtomicLong();
        private volatile Flow.Subscription upstream;
        private volatile boolean capped;

        CountingBodySubscriber(HttpResponse.BodySubscriber<T> inner, long cap) {
            this.inner = inner;
            this.cap = cap;
        }

        @Override public CompletionStage<T> getBody() { return inner.getBody(); }

        @Override
        public void onSubscribe(Flow.Subscription subscription) {
            this.upstream = subscription;
            inner.onSubscribe(subscription);
        }

        @Override
        public void onNext(List<ByteBuffer> item) {
            if (capped) return;
            long total = 0;
            for (ByteBuffer b : item) total += b.remaining();
            long now = seen.addAndGet(total);
            if (now > cap) {
                capped = true;
                Flow.Subscription s = upstream;
                if (s != null) s.cancel();
                inner.onError(new IOException(
                    "response body exceeds " + cap + "-byte cap (received " + now + " bytes)"));
                return;
            }
            inner.onNext(item);
        }

        @Override public void onError(Throwable throwable) { if (!capped) inner.onError(throwable); }
        @Override public void onComplete() { if (!capped) inner.onComplete(); }
    }
}
