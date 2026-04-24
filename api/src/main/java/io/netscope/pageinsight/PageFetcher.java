package io.netscope.pageinsight;

import io.netscope.common.SafeHttpClient;
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

    private final SafeHttpClient http;
    public PageFetcher(SafeHttpClient http) { this.http = http; }

    public record Fetched(int status, String body, Map<String, List<String>> headers, URI url) {}

    public Fetched fetch(String url) throws Exception {
        if (!url.startsWith("http")) url = "https://" + url;
        URI uri = URI.create(url);
        HttpResponse<String> res = http.send(
            HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(12))
                .header("User-Agent", "NetScope/1.0").GET().build(),
            HttpResponse.BodyHandlers.ofString());
        String body = res.body() == null ? "" : res.body();
        if (body.length() > MAX_BODY) body = body.substring(0, MAX_BODY);
        return new Fetched(res.statusCode(), body, res.headers().map(), uri);
    }
}
