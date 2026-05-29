package io.netscope.common;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DomainNormaliserTest {

    @Test void null_input_returns_null() {
        assertThat(DomainNormaliser.toAscii(null)).isNull();
    }

    @Test void empty_input_returns_empty() {
        assertThat(DomainNormaliser.toAscii("")).isEmpty();
        assertThat(DomainNormaliser.toAscii("   ")).isEmpty();
    }

    @Test void ascii_input_passes_through_unchanged() {
        assertThat(DomainNormaliser.toAscii("example.com")).isEqualTo("example.com");
        assertThat(DomainNormaliser.toAscii("API.Example.com"))
            .isEqualTo("api.example.com");   // lowercased
    }

    @Test void unicode_idn_returns_punycode_ace_form() {
        // münchen.de — the canonical IDNA test fixture. RFC 5891 §C.1
        // example uses xn--mnchen-3ya as the encoded form.
        assertThat(DomainNormaliser.toAscii("münchen.de"))
            .isEqualTo("xn--mnchen-3ya.de");
    }

    @Test void cyrillic_homograph_canonicalises_distinctly() {
        // "аpple.com" — first character is Cyrillic а (U+0430). The
        // canonical ACE form must be DISTINCT from the latin "apple.com"
        // so the downstream regex + resolver agree on what the host is.
        String canonical = DomainNormaliser.toAscii("аpple.com");
        assertThat(canonical).isNotEqualTo("apple.com");
        assertThat(canonical).startsWith("xn--");
    }

    @Test void STD3_rejects_zero_width_no_break_space() {
        // U+FEFF (BOM) is the kind of zero-width invisible codepoint
        // attackers like to splice into a hostname to make two domains
        // look identical to humans. The pure-ASCII fast path skips it
        // because U+FEFF > 0x7F, IDN.toASCII with STD3 then rejects
        // because BOM isn't valid in any DNS label.
        assertThatThrownBy(() -> DomainNormaliser.toAscii("examp﻿le.com"))
            .isInstanceOf(ApiException.class)
            .hasMessageContaining("invalid domain");
    }

    @Test void ascii_underscore_passes_through_for_dns_query_names() {
        // STD3 strictness applies only to inputs that actually carry
        // Unicode. Pure-ASCII hostnames take the fast path so DNS query
        // names like _dmarc.example.com and selector._domainkey.example.com
        // still reach the downstream regex check that knows whether
        // underscore is legal in this controller's context.
        assertThat(DomainNormaliser.toAscii("_dmarc.example.com"))
            .isEqualTo("_dmarc.example.com");
        assertThat(DomainNormaliser.toAscii("selector._domainkey.example.com"))
            .isEqualTo("selector._domainkey.example.com");
    }
}
