package io.netscope.ip.sources;

import java.util.Map;

/** Tiny helper: skip null / blank / "null" strings so the JSON
 *  emitted to the frontend doesn't get cluttered with empty fields.
 *  Shared across every fetcher because every JSON-API response has
 *  the same problem of optional fields. */
public final class IpSourceFields {
    private IpSourceFields() {}

    public static void put(Map<String, Object> m, String key, Object value) {
        if (value == null) return;
        if (value instanceof String s && (s.isBlank() || "null".equals(s))) return;
        m.put(key, value);
    }
}
