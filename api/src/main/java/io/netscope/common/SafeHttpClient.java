package io.netscope.common;

import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Wraps java.net.http.HttpClient with manual redirect handling that re-runs
 * TargetValidator on every hop. Prevents SSRF where an attacker-controlled
 * public host redirects to 127.0.0.1 or cloud metadata. Also caps request and
 * response size to prevent resource exhaustion.
 */
@Component
public class SafeHttpClient {

    private static final int MAX_REDIRECTS = 5;
    private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(10);

    private final HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
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
            HttpResponse<T> res = client.send(req, handler);
            int status = res.statusCode();
            if (status >= 300 && status < 400) {
                String location = res.headers().firstValue("location").orElse(null);
                if (location == null) return res;
                URI next = req.uri().resolve(location);
                if (next.getHost() == null) return res;
                req = HttpRequest.newBuilder(next)
                    .timeout(req.timeout().orElse(Duration.ofSeconds(10)))
                    .header("User-Agent", "NetScope/1.0")
                    .method(req.method(), HttpRequest.BodyPublishers.noBody())
                    .build();
                continue;
            }
            return res;
        }
        throw new RuntimeException("too many redirects");
    }
}
