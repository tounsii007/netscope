package io.netscope.common.security;
import io.netscope.common.errors.ApiException;

import java.net.IDN;

/**
 * Domain-input canonicaliser for controllers that take a bare hostname
 * (DNS / DKIM / CT-logs / DoH / email-auth) and do their OWN ASCII regex
 * validation rather than going through {@link TargetValidator}.
 *
 * Without this helper each of those controllers would either:
 *   • reject every Unicode hostname outright (münchen.de → 400 invalid),
 *     because the local regex {@code ^[a-zA-Z0-9.-]+$} is ASCII-only; or
 *   • accept Cyrillic-homograph confusables (аpple.com using U+0430)
 *     because the local regex doesn't normalise before matching.
 *
 * Mirrors {@link TargetValidator}'s IDN treatment so the two paths can
 * never diverge on what counts as a "valid" host. Strictness flag is
 * {@link IDN#USE_STD3_ASCII_RULES} — see the comment over there.
 *
 * Returns the Punycode (xn--) form for non-ASCII inputs. ASCII inputs
 * pass through unchanged. Throws {@link ApiException} (400) for inputs
 * IDN cannot canonicalise — controllers can then propagate without
 * a wrapping try/catch.
 */
public final class DomainNormaliser {
    private DomainNormaliser() {}

    /**
     * Canonicalise {@code raw} to its ASCII-Compatible Encoding (ACE).
     * Trims, lowercases, then runs IDN.toASCII with STD3 strict-ASCII
     * rules. Empty / null input returns null so callers can keep their
     * own "domain is required" check intact.
     */
    public static String toAscii(String raw) {
        if (raw == null) return null;
        String s = raw.trim().toLowerCase();
        if (s.isEmpty()) return s;
        // Short-circuit for purely ASCII inputs. STD3 forbids underscore
        // and other punctuation that downstream DNS controllers want to
        // accept (e.g. {@code _dmarc.example.com}, DKIM selector
        // queries). Running such inputs through IDN.toASCII would 400
        // them at this canonicalisation step. Each controller's own
        // regex enforces its actual character-class policy.
        if (isPureAscii(s)) return s;
        // Pre-filter codepoints that IDN.toASCII in JDK 21+ silently maps
        // through despite the STD3 flag — BOM (U+FEFF), em-dash (U+2014),
        // right-to-left override (U+202E), etc. Reuses the same Unicode-
        // category whitelist {@link TargetValidator} applies on its IDN
        // path so the two domain-input surfaces can't disagree on what
        // qualifies as a "valid" hostname codepoint.
        if (TargetValidator.hasNonHostCodepoint(s)) {
            throw ApiException.badRequest("invalid domain (illegal codepoint)");
        }
        try {
            return IDN.toASCII(s, IDN.USE_STD3_ASCII_RULES);
        } catch (IllegalArgumentException e) {
            // Includes control chars, oversized labels, and codepoints
            // forbidden by STD3 — exactly the inputs we want rejected
            // before the local regex fires.
            throw ApiException.badRequest("invalid domain (IDN normalisation failed)");
        }
    }

    /** True iff every codepoint in {@code s} is ASCII (≤ 0x7F). Cheap
     *  fast-path for the common case. */
    private static boolean isPureAscii(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) > 0x7F) return false;
        }
        return true;
    }
}
