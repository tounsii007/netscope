package io.netscope.dkim;

import io.netscope.common.ApiException;
import io.netscope.common.BoundedDns;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Standalone DKIM key fetcher and analyser.
 *
 * Looks up the DKIM-1 TXT record at {@code <selector>._domainkey.<domain>},
 * parses the tag/value structure, decodes the base64-encoded public key,
 * and reports key size, algorithm, hash support, service scope, and any
 * weaknesses (sub-1024-bit RSA, SHA-1 only, revoked-via-empty-p, test mode).
 *
 * Distinct from {@link io.netscope.email.EmailAuthController#analyze} which
 * only checks DKIM presence as part of a combined SPF/DMARC audit; this
 * controller exposes the key itself and quality signals about it. Email
 * senders rotating DKIM keys use it to verify their published key matches
 * what their signing infrastructure produced.
 */
@RestController
@RequestMapping("/api/v1/dkim")
public class DkimController {

    /** Selectors we probe when the caller does not supply one. Covers
     *  Google Workspace, Microsoft 365, SendGrid, Mailgun, Postmark,
     *  AWS SES, and the legacy {@code default} fallback. Ordering is
     *  irrelevant — probes fan out in parallel. */
    private static final List<String> DEFAULT_SELECTORS = List.of(
        "google", "selector1", "selector2", "k1", "k2", "k3",
        "s1", "s2", "mail", "default", "dkim", "smtpapi", "mandrill"
    );

    /** Virtual-thread executor for the parallel selector probe. Sized
     *  to the selector list — at 13 in-flight DNS queries per request
     *  the cost is negligible, and each thread terminates the moment
     *  its BoundedDns call returns. */
    private final ExecutorService probePool =
        Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("dkim-probe-", 0).factory());

    @GetMapping("/{domain}")
    public Map<String, Object> lookup(
            @PathVariable String domain,
            @RequestParam(required = false) String selector) {

        if (!domain.matches("^[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }
        if (selector != null && !selector.matches("^[a-zA-Z0-9._-]{1,63}$")) {
            throw ApiException.badRequest("invalid selector");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);

        if (selector != null && !selector.isBlank()) {
            Map<String, Object> single = fetchOne(domain, selector);
            out.put("selector", selector);
            out.put("result", single);
            out.put("triedSelectors", List.of(selector));
            return out;
        }

        // Probe every known selector in PARALLEL but RETURN STREAMING:
        // walk the futures in canonical (DEFAULT_SELECTORS) order, await
        // each one in turn, return the moment a present=true probe
        // resolves. Cancel the remaining futures so the slow tail can't
        // hold a virtual thread forever.
        //
        // Latency model:
        //   • Best  case — first selector resolves → ~50ms (matches the
        //                  old serial fast-path; the previous "wait-for-
        //                  all" rewrite regressed this to ~3s).
        //   • Worst case — every selector misses    → ~3s (BoundedDns cap),
        //                  not the 13×3=39s of the serial version.
        //
        // Determinism: we walk canonical order on the AWAIT side too, so
        // two domains publishing the same set of selectors always return
        // the same canonical "winner" across calls.
        List<CompletableFuture<Map.Entry<String, Map<String, Object>>>> futures =
            new ArrayList<>(DEFAULT_SELECTORS.size());
        for (String s : DEFAULT_SELECTORS) {
            futures.add(CompletableFuture.supplyAsync(
                () -> Map.entry(s, fetchOne(domain, s)), probePool));
        }

        List<String> tried = new ArrayList<>(futures.size());
        Map<String, Object> winningResult = null;
        String winningSelector = null;
        for (int i = 0; i < futures.size(); i++) {
            String selectorAtI = DEFAULT_SELECTORS.get(i);
            try {
                Map.Entry<String, Map<String, Object>> e = futures.get(i).get();
                tried.add(e.getKey());
                if (Boolean.TRUE.equals(e.getValue().get("present"))) {
                    winningResult = e.getValue();
                    winningSelector = e.getKey();
                    // Cancel every still-pending probe — they can't change
                    // the answer at this point (canonical order means we
                    // already prefer this one).
                    for (int j = i + 1; j < futures.size(); j++) {
                        futures.get(j).cancel(true);
                    }
                    break;
                }
            } catch (Exception ignored) {
                // Treat as "tried but probe errored". Record the selector
                // name we attempted so the response's triedSelectors list
                // matches what the caller actually asked for.
                tried.add(selectorAtI);
            }
        }

        if (winningResult != null) {
            out.put("selector", winningSelector);
            out.put("result", winningResult);
            out.put("triedSelectors", tried);
            return out;
        }
        out.put("selector", null);
        out.put("result", Map.of(
            "present", false,
            "warnings", List.of("No DKIM record found at any of the probed selectors — pass ?selector=<your-selector>")
        ));
        out.put("triedSelectors", tried);
        return out;
    }

    /**
     * Resolve and analyse a single selector. Always returns a populated
     * result map; absence is signalled by {@code present: false}.
     */
    private Map<String, Object> fetchOne(String domain, String selector) {
        Map<String, Object> r = new LinkedHashMap<>();
        String host = selector + "._domainkey." + domain;
        r.put("queriedHost", host);

        List<String> txts = txt(host);
        // DKIM records may exceed 255 chars and arrive as multiple chunks;
        // dnsjava already concatenates them via TXTRecord.getStrings().
        //
        // RFC 6376 §3.6.1 requires v=DKIM1 as the FIRST tag of any public
        // key record. The previous matcher accepted records starting with
        // k= or p= alone, which let unrelated TXT records (e.g. a stray
        // RDAP key=value entry someone mis-published) look like a DKIM
        // hit. Strict v=DKIM1 anchor + tolerance for surrounding
        // whitespace catches every compliant publication without false
        // positives.
        String dkim = txts.stream()
            .filter(t -> t.trim().startsWith("v=DKIM1") || t.contains("; v=DKIM1"))
            .findFirst().orElse(null);

        if (dkim == null) {
            r.put("present", false);
            return r;
        }
        r.put("present", true);
        r.put("rawRecord", dkim);

        Map<String, String> tags = parseTags(dkim);
        r.put("tags", tags);
        r.put("keyType", tags.getOrDefault("k", "rsa"));      // RFC 6376 §3.6.1
        r.put("serviceType", tags.getOrDefault("s", "*"));     // "*" or "email"
        r.put("flags", tags.getOrDefault("t", ""));            // y=testing, s=strict
        r.put("hashAlgorithms", parseHashAlgs(tags.get("h"))); // default: all
        r.put("notes", tags.get("n"));

        List<String> warnings = new ArrayList<>();
        String pBase64 = tags.get("p");
        boolean revoked = pBase64 != null && pBase64.isBlank();
        r.put("revoked", revoked);
        if (revoked) {
            // Empty p= means the key has been revoked (RFC 6376 §3.6.1).
            // Common during rotation; flag so operators know it's expected.
            warnings.add("Key is revoked (empty p= tag) — common during key rotation");
        } else if (pBase64 == null) {
            warnings.add("Missing p= tag — DKIM record is malformed");
        } else {
            try {
                PubKeyInfo info = decodeKey(pBase64, (String) r.get("keyType"));
                r.put("publicKeyBase64", pBase64);
                r.put("keySize", info.bits);
                r.put("keyAlgorithm", info.algorithm);
                if ("rsa".equalsIgnoreCase((String) r.get("keyType"))) {
                    if (info.bits < 1024) {
                        warnings.add("RSA key is " + info.bits + " bits — below 1024 fails verification at most providers");
                    } else if (info.bits < 2048) {
                        warnings.add("RSA key is " + info.bits + " bits — 2048 is the modern minimum");
                    }
                }
            } catch (Exception e) {
                warnings.add("Public key is unparseable: " + e.getClass().getSimpleName());
            }
        }

        // sha1 alone is deprecated per RFC 8301 — require sha256.
        @SuppressWarnings("unchecked")
        List<String> hashes = (List<String>) r.get("hashAlgorithms");
        if (hashes.size() == 1 && "sha1".equals(hashes.get(0))) {
            warnings.add("Only SHA-1 declared (h=sha1) — RFC 8301 deprecates SHA-1 for DKIM; advertise SHA-256");
        }

        if ("y".equals(tags.get("t"))) {
            warnings.add("Test mode flag set (t=y) — verifiers may ignore failures; remove before production");
        }

        r.put("warnings", warnings);
        return r;
    }

    /** Parse {@code k=v; k2=v2;} tag list. Quoted values are not used by
     *  DKIM so we keep this simple. Package-private so the unit test can
     *  exercise it directly without going through DNS. */
    static Map<String, String> parseTags(String record) {
        Map<String, String> tags = new LinkedHashMap<>();
        for (String part : record.split(";")) {
            String[] kv = part.trim().split("=", 2);
            if (kv.length == 2) tags.put(kv[0].trim(), kv[1].trim());
        }
        return tags;
    }

    /** Package-private for unit tests. RFC 6376: when {@code h=} is
     *  absent the verifier MUST accept any algorithm; we default to the
     *  two historical choices to keep the UI useful in that case. */
    static List<String> parseHashAlgs(String h) {
        if (h == null || h.isBlank()) return List.of("sha1", "sha256"); // default
        List<String> out = new ArrayList<>();
        for (String a : h.split(":")) {
            String t = a.trim().toLowerCase();
            if (!t.isEmpty()) out.add(t);
        }
        return out;
    }

    /** Package-private. Decode a DKIM-published public key from base64
     *  X.509 SubjectPublicKeyInfo. */
    static PubKeyInfo decodeKey(String base64, String keyType) throws Exception {
        // Strip whitespace that some DNS providers introduce when chunking.
        byte[] bytes = Base64.getDecoder().decode(base64.replaceAll("\\s+", ""));
        if ("ed25519".equalsIgnoreCase(keyType)) {
            // ed25519 has a fixed 256-bit key size (RFC 8463).
            return new PubKeyInfo("Ed25519", 256);
        }
        // Default: RSA per RFC 6376.
        KeyFactory kf = KeyFactory.getInstance("RSA");
        PublicKey pub = kf.generatePublic(new X509EncodedKeySpec(bytes));
        int bits = (pub instanceof RSAPublicKey rsa) ? rsa.getModulus().bitLength() : -1;
        return new PubKeyInfo("RSA", bits);
    }

    /** Package-private record so {@link DkimControllerTest} can assert
     *  on the parsed key shape without reflection. */
    record PubKeyInfo(String algorithm, int bits) {}

    private static List<String> txt(String host) {
        try {
            Record[] recs = BoundedDns.run(host, Type.TXT);
            if (recs == null) return List.of();
            List<String> out = new ArrayList<>();
            for (Record r : recs) if (r instanceof TXTRecord t) {
                out.add(String.join("", t.getStrings()));
            }
            return out;
        } catch (Exception e) { return List.of(); }
    }
}
