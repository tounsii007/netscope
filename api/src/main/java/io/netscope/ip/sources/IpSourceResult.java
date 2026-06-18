package io.netscope.ip.sources;

import java.util.Map;

/**
 * One source's result, ok or failed. Serialised to JSON for the
 * client. {@code error} carries the exception class name only — never
 * the raw message — so upstream IPs / API-key fragments / Cloudflare
 * ray IDs that geo providers occasionally embed don't leak through.
 */
public record IpSourceResult(
    String source,
    String url,
    boolean ok,
    long latencyMs,
    Map<String, Object> data,
    String error
) {
    public static IpSourceResult ok(String n, String url, Map<String, Object> d, long ms) {
        return new IpSourceResult(n, url, true, ms, d, null);
    }
    public static IpSourceResult fail(String n, String url, String err, long ms) {
        return new IpSourceResult(n, url, false, ms, null, err);
    }
}
