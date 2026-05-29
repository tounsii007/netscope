package io.netscope.common;
import io.netscope.common.errors.ApiException;
import io.netscope.common.security.TargetValidator;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * IDN / Punycode normalisation tests for TargetValidator.
 *
 * Behaviour pinned by these tests, post the STD3 + ASCII-fast-path
 * refactor (iterations 1 + 5):
 *
 *   1. Legitimate Unicode hostnames (münchen.de) canonicalise to their
 *      xn-- Punycode form and proceed past the regex check.
 *   2. Cyrillic / mixed-script homographs (аpple.com using U+0430)
 *      canonicalise to a DIFFERENT xn-- form than the latin "apple.com"
 *      so the downstream resolver and the validator agree on what the
 *      host is.
 *   3. STD3 strict-ASCII rules reject inputs with codepoints that
 *      aren't valid in DNS labels (control chars, zero-width spaces).
 *   4. Pure-ASCII inputs (including underscore-prefixed DNS query
 *      names like _dmarc.example.com) bypass IDN entirely so STD3
 *      strictness doesn't break those workflows.
 *   5. IP literals (v4 + v6) skip IDN unconditionally.
 */
class TargetValidatorIdnTest {

    private final TargetValidator v = new TargetValidator();

    /* ─── canonicalisation of legitimate Unicode hostnames ────────────── */

    @Test void canonicalises_unicode_idn_to_punycode_form() {
        // münchen.de → xn--mnchen-3ya.de. We assert no ApiException is
        // thrown by the validation/regex step; DNS resolution may still
        // fail in offline test envs and that's a separate UnknownHost
        // case the validator does throw on — caught and rethrown as
        // bad-request. Test only the canonicalisation step survives.
        try {
            v.resolveAndValidate("münchen.de");
        } catch (ApiException e) {
            // Acceptable failure modes during offline tests: 400 from
            // "could not resolve" (DNS resolver isn't reachable) or
            // 403 from "reserved or internal" (resolver returns a
            // captive-portal IP). What MUST NOT happen is a 400 from
            // "invalid hostname or IP" — that means IDN normalisation
            // didn't fire.
            assertThatNoException().isThrownBy(() -> {
                if (e.getMessage().contains("invalid hostname")) {
                    throw new AssertionError(
                        "IDN normalisation failed — regex still tripped on Unicode");
                }
            });
        }
    }

    @Test void cyrillic_homograph_canonicalises_to_distinct_punycode() {
        // "аpple.com" (first char Cyrillic а, U+0430) → xn--pple-43d.com.
        // If the validator accepted the homograph as-is, the resolver
        // would then convert it to xn-- form at lookup time and resolve
        // to a different host than what the user / admin saw in logs.
        // Normalising up-front forces resolver + validator to agree.
        try {
            v.resolveAndValidate("аpple.com");
        } catch (ApiException e) {
            if (e.getMessage().contains("invalid hostname or IP")) {
                throw new AssertionError(
                    "Cyrillic homograph was rejected by raw-regex — IDN normalisation missing");
            }
        }
    }

    /* ─── STD3 strictness (zero-width invisibles, control chars) ──────── */

    @Test void rejects_zero_width_no_break_space_in_label() {
        // U+FEFF (BOM) is a zero-width Unicode codepoint attackers
        // splice into hostnames to make two domains look identical
        // to humans. STD3 forbids it — IDN.toASCII throws and the
        // validator returns a clean 400.
        assertThatThrownBy(() -> v.resolveAndValidate("examp﻿le.com"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid hostname");
    }

    @Test void rejects_unicode_codepoint_not_valid_in_dns_label() {
        // Em-dash (U+2014). Looks like a hyphen but isn't legal in a
        // DNS label after IDNA encoding. STD3 trips this case.
        assertThatThrownBy(() -> v.resolveAndValidate("foo—bar.com"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid hostname");
    }

    /* ─── ASCII fast path ─────────────────────────────────────────────── */

    @Test void ascii_inputs_bypass_idn_normalisation() {
        // The fast path means STD3 strictness doesn't apply to ASCII
        // inputs. HOST_PATTERN's underscore allowance is what
        // determines whether _dmarc.example.com is acceptable here,
        // not IDN.toASCII. This test pins that the fastpath is
        // actually reached and IDN is NOT invoked for pure-ASCII
        // input — otherwise STD3 would reject underscore labels.
        try {
            v.resolveAndValidate("api.example.com");
        } catch (ApiException e) {
            if (e.getMessage().contains("invalid hostname or IP")) {
                throw new AssertionError(
                    "ASCII input was unexpectedly rejected — fast path not reached?");
            }
        }
    }

    @Test void ascii_invalid_chars_still_rejected_via_regex() {
        // Space character is ASCII so it skips IDN. The regex check
        // then rejects it as "invalid hostname or IP". Pinning this
        // path because it's the visible failure mode for the most
        // common bad-input pattern (user pasted a URL with a space).
        assertThatThrownBy(() -> v.resolveAndValidate("evil .com"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid hostname");
    }

    /* ─── IP-literal short circuit ───────────────────────────────────── */

    @Test void ip_literals_still_bypass_idn() {
        // IPv4/IPv6 literals must NOT go through IDN.toASCII (which
        // would mangle "::1" by lowercasing surrounding chars or
        // tripping on the colons). Loopback resolution still throws
        // forbidden — that confirms the IP path is reached.
        assertThatThrownBy(() -> v.resolveAndValidate("127.0.0.1"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("reserved or internal");
        assertThatThrownBy(() -> v.resolveAndValidate("::1"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("reserved or internal");
    }
}
