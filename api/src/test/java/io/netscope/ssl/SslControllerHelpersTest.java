package io.netscope.ssl;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit coverage for the static helpers that decode X.509 extensions out
 * of raw byte slices — separated from the live-handshake integration
 * tests because these don't need a TLS server.
 *
 * The interesting paths are:
 *   • describeKeyUsage — bit-array → conventional names
 *   • extractAiaFromOctets — DER octet-string → OCSP / caIssuers URL split
 */
class SslControllerHelpersTest {

    /* ─── describeKeyUsage ─────────────────────────────────────────────── */

    @Test void describeKeyUsage_returns_empty_when_extension_absent() {
        // X509Certificate.getKeyUsage() returns null when the cert omits
        // the extension. We must surface an empty list, not NPE.
        assertThat(SslController.describeKeyUsage(null)).isEmpty();
    }

    @Test void describeKeyUsage_maps_each_bit_to_canonical_name() {
        // Typical leaf cert for a TLS server: digitalSignature +
        // keyEncipherment (RSA) or digitalSignature alone (EC).
        boolean[] bits = { true, false, true, false, false, false, false, false, false };
        assertThat(SslController.describeKeyUsage(bits))
            .containsExactly("digitalSignature", "keyEncipherment");
    }

    @Test void describeKeyUsage_recognises_keyCertSign_root_pattern() {
        // CA certs set keyCertSign (bit 5) + cRLSign (bit 6).
        boolean[] bits = { false, false, false, false, false, true, true, false, false };
        assertThat(SslController.describeKeyUsage(bits))
            .containsExactly("keyCertSign", "cRLSign");
    }

    @Test void describeKeyUsage_handles_short_bit_arrays_safely() {
        // RFC 5280 §4.2.1.3 allows the encoded bit string to be shorter
        // than 9 bits — we must not overrun the names[] array.
        boolean[] bits = { true, false };   // only the first two bits encoded
        assertThat(SslController.describeKeyUsage(bits))
            .containsExactly("digitalSignature");
    }

    @Test void describeKeyUsage_handles_longer_bit_arrays_by_truncating() {
        // 11 bits — the extra two must be silently ignored.
        boolean[] bits = new boolean[11];
        bits[0] = true;
        assertThat(SslController.describeKeyUsage(bits))
            .containsExactly("digitalSignature");
    }

    /* ─── extractAiaFromOctets ─────────────────────────────────────────── */

    @Test void extractAiaFromOctets_returns_empty_when_input_null() {
        assertThat(SslController.extractAiaFromOctets(null)).isEmpty();
    }

    @Test void extractAiaFromOctets_returns_empty_when_no_oid_present() {
        // A random byte string containing no AIA-OID prefix should return
        // no URLs even if it happens to contain "http" somewhere.
        byte[] noise = "garbage-with-http-but-no-oid".getBytes(StandardCharsets.US_ASCII);
        assertThat(SslController.extractAiaFromOctets(noise)).isEmpty();
    }

    @Test void extractAiaFromOctets_pulls_ocsp_url_when_method_byte_is_01() throws Exception {
        // Synthesise: <OID-prefix><0x01><gap><http://ocsp.example.com/>
        byte[] blob = aiaBlob((byte) 0x01, "http://ocsp.example.com/");
        Map<String, List<String>> out = SslController.extractAiaFromOctets(blob);
        assertThat(out).containsOnlyKeys("ocsp");
        assertThat(out.get("ocsp")).containsExactly("http://ocsp.example.com/");
    }

    @Test void extractAiaFromOctets_pulls_caIssuers_url_when_method_byte_is_02() throws Exception {
        byte[] blob = aiaBlob((byte) 0x02, "http://ca.example.com/intermediate.crt");
        Map<String, List<String>> out = SslController.extractAiaFromOctets(blob);
        assertThat(out).containsOnlyKeys("caIssuers");
        assertThat(out.get("caIssuers")).containsExactly("http://ca.example.com/intermediate.crt");
    }

    @Test void extractAiaFromOctets_extracts_both_when_blob_has_both_entries() throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        bos.write(aiaBlob((byte) 0x01, "http://ocsp.letsencrypt.org/"));
        bos.write(aiaBlob((byte) 0x02, "http://r3.i.lencr.org/"));
        Map<String, List<String>> out = SslController.extractAiaFromOctets(bos.toByteArray());
        assertThat(out).containsOnlyKeys("ocsp", "caIssuers");
        assertThat(out.get("ocsp")).containsExactly("http://ocsp.letsencrypt.org/");
        assertThat(out.get("caIssuers")).containsExactly("http://r3.i.lencr.org/");
    }

    @Test void extractAiaFromOctets_handles_https_urls() throws Exception {
        byte[] blob = aiaBlob((byte) 0x01, "https://ocsp.digicert.com/");
        Map<String, List<String>> out = SslController.extractAiaFromOctets(blob);
        assertThat(out.get("ocsp")).containsExactly("https://ocsp.digicert.com/");
    }

    /**
     * Build a minimal AIA AccessDescription blob: the canonical OID
     * prefix (2B 06 01 05 05 07 30), the discriminator byte (0x01 for
     * OCSP, 0x02 for caIssuers), a small filler gap, then the URL bytes.
     *
     * Mimics the part of the cert's AIA extension that the byte-level
     * scanner cares about. Not a full DER-encoded SEQUENCE — the
     * implementation doesn't need that to extract URLs.
     */
    private static byte[] aiaBlob(byte method, String url) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        // OID prefix 1.3.6.1.5.5.7.48
        bos.write(new byte[]{0x2B, 0x06, 0x01, 0x05, 0x05, 0x07, 0x30});
        // Discriminator: OCSP (0x01) or caIssuers (0x02)
        bos.write(method);
        // Tag + length for GeneralName URI (real CAs emit 0x86 <len>)
        bos.write(0x86);
        bos.write(url.length());
        bos.write(url.getBytes(StandardCharsets.US_ASCII));
        return bos.toByteArray();
    }
}
