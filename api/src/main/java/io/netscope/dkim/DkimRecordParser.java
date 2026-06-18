package io.netscope.dkim;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Parses a single DKIM TXT record string into its tag→value map and
 * the (h=)-declared hash algorithm list.
 *
 * RFC 6376 §3.6.1 defines DKIM records as {@code v=DKIM1; k=rsa; p=...}
 * style tag lists. This parser is intentionally minimal — no quoting
 * support (DKIM does not use it) and no whitespace canonicalisation
 * beyond per-tag trim, which is exactly what dnsjava hands us after
 * concatenating multi-string TXT records.
 */
public final class DkimRecordParser {
    private DkimRecordParser() {}

    /** True when {@code txt} looks like a DKIM-1 record: either starts
     *  with {@code v=DKIM1} (canonical form) or contains the
     *  {@code; v=DKIM1} marker mid-string (some senders publish other
     *  tags before v=, technically non-compliant but real). */
    static boolean looksLikeDkim(String txt) {
        if (txt == null) return false;
        return txt.trim().startsWith("v=DKIM1") || txt.contains("; v=DKIM1");
    }

    /** Parse {@code k=v; k2=v2;} tag list. Tag order is preserved to
     *  match the wire ordering some operators rely on for diffs. */
    public static Map<String, String> parseTags(String record) {
        Map<String, String> tags = new LinkedHashMap<>();
        for (String part : record.split(";")) {
            String[] kv = part.trim().split("=", 2);
            if (kv.length == 2) tags.put(kv[0].trim(), kv[1].trim());
        }
        return tags;
    }

    /** Hash algorithms declared via {@code h=}. RFC 6376 says missing
     *  h= means accept any algorithm — we surface the two historical
     *  choices so the UI can render a meaningful default. */
    public static List<String> parseHashAlgs(String h) {
        if (h == null || h.isBlank()) return List.of("sha1", "sha256");
        List<String> out = new ArrayList<>();
        for (String a : h.split(":")) {
            String t = a.trim().toLowerCase();
            if (!t.isEmpty()) out.add(t);
        }
        return out;
    }
}
