package io.netscope.doh;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * TCP port-reachability check for a DNS-over-TLS endpoint. We connect
 * to the provider's IP on the conventional DoT port (853, RFC 7858)
 * and time how long the handshake takes, but we do NOT actually run a
 * TLS handshake — port-open status is enough to tell the user whether
 * their network blocks outbound 853.
 *
 * A full TLS-handshake probe with cert-chain inspection belongs in a
 * separate tool ({@code /api/v1/ssl/}).
 */
public final class DotReachability {
    private DotReachability() {}

    /** Default DoT port. */
    public static final int PORT = 853;

    public static Map<String, Object> probe(String host, Duration timeout) {
        long t0 = System.currentTimeMillis();
        Map<String, Object> r = new LinkedHashMap<>();
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, PORT), (int) timeout.toMillis());
            r.put("reachable", true);
            r.put("port", PORT);
            r.put("latencyMs", System.currentTimeMillis() - t0);
        } catch (Exception e) {
            r.put("reachable", false);
            r.put("port", PORT);
            r.put("latencyMs", System.currentTimeMillis() - t0);
            r.put("error", e.getClass().getSimpleName());
        }
        return r;
    }
}
