package io.netscope.subdomains;

import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;

/**
 * Lazy-init {@link RestClient} shared by both subdomain CT sources
 * (crt.sh and CertSpotter).
 *
 * <p>Building a {@code RestClient} at field-init time triggers HTTP-stack
 * setup that fails in restricted environments — and is wasted work for
 * instances that never see traffic. The {@link #get()} method
 * double-checks and caches after first call.
 *
 * <p>The {@code curl/8.18.0} User-Agent is deliberate: crt.sh's nginx is
 * finicky about UA fingerprinting and the curl UA is known-good from
 * the same machine. CertSpotter accepts any UA so this is harmless
 * there.
 */
final class SubdomainHttpClient {

    /** TCP connect timeout to crt.sh / CertSpotter. */
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);

    /** Read timeout — generous because the CT-log queries can take a while
     *  to materialise on the upstream side. */
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(20);

    private volatile RestClient rest;

    RestClient get() {
        RestClient r = rest;
        if (r == null) {
            synchronized (this) {
                if ((r = rest) == null) {
                    HttpClient http = HttpClient.newBuilder()
                        .connectTimeout(CONNECT_TIMEOUT)
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .version(HttpClient.Version.HTTP_1_1)
                        .build();
                    var rf = new JdkClientHttpRequestFactory(http);
                    rf.setReadTimeout(READ_TIMEOUT);
                    r = rest = RestClient.builder()
                        .requestFactory(rf)
                        .defaultHeader("User-Agent", "curl/8.18.0")
                        .defaultHeader("Accept", "application/json, */*")
                        .build();
                }
            }
        }
        return r;
    }
}
