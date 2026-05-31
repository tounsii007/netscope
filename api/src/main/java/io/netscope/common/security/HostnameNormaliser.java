package io.netscope.common.security;

import io.netscope.common.errors.ApiException;

import java.net.IDN;
import java.util.regex.Pattern;

/**
 * Canonicalises and syntactically validates a target string before it
 * reaches the resolver. Handles:
 *
 *   • the lenient ASCII host regex (allows underscores for SaaS DNS)
 *   • IDN punycode normalisation (Unicode → xn--…)
 *   • a defence-in-depth codepoint filter that rejects homograph-class
 *     characters the JDK's {@link IDN#toASCII} silently passes through
 *
 * Returns the canonical ASCII form on success; throws a 400
 * {@link ApiException} for any rejected input.
 */
final class HostnameNormaliser {

    private static final Pattern HOST_PATTERN =
        Pattern.compile("^(?=.{1,253}$)([a-zA-Z0-9_-]{1,63}\\.)*[a-zA-Z0-9_-]{1,63}$");

    private HostnameNormaliser() {}

    /**
     * Canonicalise {@code trimmed} (lowercase, whitespace-stripped) and
     * verify it parses as either an IP literal or a syntactically valid
     * hostname. Returns the form to feed into the resolver.
     */
    static String canonicalise(String trimmed) {
        // Normalise IDN / Unicode hostnames to ASCII Compatible Encoding
        // (Punycode) before the pattern check. Without this:
        //   1. Legitimate non-ASCII domains (münchen.de, παράδειγμα.gr)
        //      were rejected outright even though they are real.
        //   2. Homograph-confusable inputs (cyrillic "а" mimicking latin
        //      "a", e.g. "аpple.com") looked legitimate to the regex but
        //      resolved via the resolver to a completely different host.
        //      IDN.toASCII converts BOTH to their canonical xn--… form,
        //      which the downstream resolver and the homograph host both
        //      agree on — the canonical form then goes through the same
        //      validation as any other ASCII host.
        // IDN.toASCII throws IllegalArgumentException on inputs it can't
        // canonicalise (control chars, oversized labels) — surface that
        // as a 400 instead of leaking the JDK exception.
        //
        // Flag = IDN.USE_STD3_ASCII_RULES (NOT ALLOW_UNASSIGNED). RFC 3490
        // STD3 forbids any character outside [A-Za-z0-9-] in DNS labels
        // after Punycode encoding, which is exactly the property we want
        // for SSRF defence: hostnames an attacker controls must reduce to
        // a canonical ASCII form OR be rejected. The earlier
        // ALLOW_UNASSIGNED flag was the LESS-secure option — it permits
        // currently-unassigned Unicode codepoints, exactly the surface
        // homograph attacks target while the IDNA tables update lags
        // the Unicode standard.
        //
        // ASCII-only fast path: HOST_PATTERN explicitly allows underscore
        // in labels (set by external SaaS DNS configs we sometimes have
        // to reach), but STD3 forbids it. Running an ASCII underscore
        // host through IDN.toASCII would 400 it here even though the
        // downstream regex accepts it. Short-circuiting for pure-ASCII
        // inputs preserves that behaviour while keeping the strict
        // canonicalisation for any input that actually carries Unicode.
        String canonical = trimmed;
        if (!isIpLiteral(canonical) && !isPureAscii(canonical)) {
            // Defence-in-depth BEFORE IDN.toASCII:
            // newer JDKs (≥21 on IDNA 2008 tables, ≥25 demonstrably) silently
            // map several attack-relevant codepoints — zero-width no-break
            // space (U+FEFF), em-dash (U+2014), right-to-left override
            // (U+202E) — into "valid" Punycode output instead of raising on
            // STD3. Reject any non-ASCII codepoint whose Unicode general
            // category is outside the letter/digit/combining-mark whitelist
            // before IDN ever sees it. Cyrillic / CJK / Hindi letters still
            // canonicalise normally; format-class and dash-punctuation
            // codepoints don't.
            if (hasNonHostCodepoint(canonical)) {
                throw ApiException.badRequest("invalid hostname (illegal codepoint)");
            }
            try {
                canonical = IDN.toASCII(canonical, IDN.USE_STD3_ASCII_RULES);
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("invalid hostname (IDN normalisation failed)");
            }
        }
        if (!HOST_PATTERN.matcher(canonical).matches() && !isIpLiteral(canonical)) {
            throw ApiException.badRequest("invalid hostname or IP");
        }
        return canonical;
    }

    static boolean isIpLiteral(String s) {
        return s.matches("^[0-9a-fA-F:.]+$");
    }

    /** True iff every codepoint is ASCII (≤ 0x7F). Cheap fast path so
     *  underscored ASCII hostnames don't trip the IDN STD3 check. */
    private static boolean isPureAscii(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) > 0x7F) return false;
        }
        return true;
    }

    /**
     * True iff {@code s} contains a non-ASCII codepoint whose Unicode
     * general category falls outside the letter/digit/combining-mark
     * set legitimate IDN hostnames use. Catches the classes IDN.toASCII
     * silently maps through:
     *
     *   • {@code Cf} — format (BOM U+FEFF, ZWJ, ZWNJ, RTL override)
     *   • {@code Cc} — control characters
     *   • {@code Cn} — unassigned codepoints (homograph attack surface
     *                  expands as Unicode adds new chars before IDNA
     *                  tables catch up)
     *   • {@code Co} — private-use codepoints
     *   • {@code Pd / Pi / Pf / Po / Ps / Pe / Pc} — punctuation in
     *                  any flavour other than the ASCII '.', '-', '_'
     *                  the host pattern already allows
     *   • {@code Zs / Zl / Zp} — non-ASCII whitespace separators
     *
     * Allowed (legitimate IDN labels in non-Latin scripts):
     *
     *   • {@code Ll/Lu/Lt/Lm/Lo} — letters (Latin, Cyrillic, CJK, …)
     *   • {@code Nd/Nl/No}       — number characters
     *   • {@code Mn/Mc}          — combining marks (needed for Arabic,
     *                              Devanagari, …)
     *
     * ASCII bytes never reach this method — {@link #isPureAscii} short-
     * circuits the caller — so the ASCII `.`, `-`, `_` exemption isn't
     * needed here.
     */
    static boolean hasNonHostCodepoint(String s) {
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            i += Character.charCount(cp);
            // ASCII label characters the host pattern explicitly allows.
            // These would otherwise classify as OTHER_PUNCTUATION ('.'),
            // DASH_PUNCTUATION ('-'), or CONNECTOR_PUNCTUATION ('_') and
            // get falsely rejected for mixed ASCII+Unicode hostnames
            // (e.g. "münchen.de" — the '.' is ASCII OTHER_PUNCTUATION).
            if (cp == '.' || cp == '-' || cp == '_') continue;
            switch (Character.getType(cp)) {
                case Character.LOWERCASE_LETTER:
                case Character.UPPERCASE_LETTER:
                case Character.TITLECASE_LETTER:
                case Character.MODIFIER_LETTER:
                case Character.OTHER_LETTER:
                case Character.DECIMAL_DIGIT_NUMBER:
                case Character.LETTER_NUMBER:
                case Character.OTHER_NUMBER:
                case Character.NON_SPACING_MARK:
                case Character.COMBINING_SPACING_MARK:
                    continue;
                default:
                    return true;
            }
        }
        return false;
    }
}
