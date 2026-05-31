package io.netscope.pageinsight;

import io.netscope.common.http.HttpUrlNormaliser;
import io.netscope.common.http.SafeHttpClient;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Shared HTML fetcher used by cookie / OG / mixed-content analyzers.
 * Caps body size at 500 KB so pathological pages can't exhaust memory.
 */
@Component
public class PageFetcher {

    public static final int MAX_BODY = 500_000;

    /** Page-fetch timeout — slightly longer than the boundary 10 s used
     *  elsewhere because HTML pages can have render-blocking server-side
     *  generation (server-side analytics, third-party tracker injection)
     *  that legitimately takes 8-10 s. */
    private static final Duration FETCH_TIMEOUT = Duration.ofSeconds(12);

    private final SafeHttpClient http;
    public PageFetcher(SafeHttpClient http) { this.http = http; }

    public record Fetched(int status, String body, Map<String, List<String>> headers, URI url) {}

    public Fetched fetch(String url) throws Exception {
        url = HttpUrlNormaliser.ensureHttpScheme(url);
        URI uri = URI.create(url);
        HttpResponse<String> res = http.send(
            HttpRequest.newBuilder(uri).timeout(FETCH_TIMEOUT)
                .header("User-Agent", "NetScope/1.0").GET().build(),
            HttpResponse.BodyHandlers.ofString());
        String body = res.body() == null ? "" : res.body();
        if (body.length() > MAX_BODY) body = body.substring(0, MAX_BODY);
        return new Fetched(res.statusCode(), body, res.headers().map(), uri);
    }
}
