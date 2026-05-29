package io.netscope.dkim;

import io.netscope.common.ApiException;
import io.netscope.common.BoundedDns;
import io.netscope.common.security.DomainNormaliser;
import io.netscope.common.ToolMetrics;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;

/**
 * Standalone DKIM key fetcher. Resolves the TXT record at
 * {@code <selector>._domainkey.<domain>}, parses it, and surfaces the
 * public key along with quality warnings.
 *
 * Business logic lives in sibling classes:
 *   • {@link DkimRecordParser}   — tag + hash-algorithm parsing
 *   • {@link DkimKeyDecoder}     — base64 → algorithm + bit size
 *   • {@link DkimWarningCheck}   — quality-rule engine
 *   • {@link DkimSelectorProber} — parallel first-match across selectors
 *
 * This controller is the HTTP boundary only: input validation, metric
 * recording, and output assembly.
 */
@RestController
@RequestMapping("/api/v1/dkim")
public class DkimController {

    /** Selectors we probe when the caller does not supply one. */
    static final List<String> DEFAULT_SELECTORS = List.of(
        "google", "selector1", "selector2", "k1", "k2", "k3",
        "s1", "s2", "mail", "default", "dkim", "smtpapi", "mandrill"
    );

    private final ExecutorService probePool;
    private final ToolMetrics metrics;

    public DkimController(@Qualifier("dkimProbeExecutor") ExecutorService dkimProbeExecutor,
                          ToolMetrics metrics) {
        this.probePool = dkimProbeExecutor;
        this.metrics = metrics;
    }

    @GetMapping("/{domain}")
    public Map<String, Object> lookup(
            @PathVariable String domain,
            @RequestParam(required = false) String selector) {
        return metrics.record("dkim", "lookup", () -> lookupInternal(domain, selector));
    }

    private Map<String, Object> lookupInternal(String domain, String selector) {
        domain = DomainNormaliser.toAscii(domain);
        if (domain == null || !domain.matches("^[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }
        if (selector != null && !selector.matches("^[a-zA-Z0-9._-]{1,63}$")) {
            throw ApiException.badRequest("invalid selector");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);

        if (selector != null && !selector.isBlank()) {
            out.put("selector", selector);
            out.put("result", fetchOne(domain, selector));
            out.put("triedSelectors", List.of(selector));
            return out;
        }

        DkimSelectorProber.Outcome outcome = DkimSelectorProber.findFirstMatch(
            domain, DEFAULT_SELECTORS, this::fetchOne, probePool);

        if (outcome.winningSelector() != null) {
            out.put("selector", outcome.winningSelector());
            out.put("result", outcome.winningResult());
        } else {
            out.put("selector", null);
            out.put("result", Map.of(
                "present", false,
                "warnings", List.of("No DKIM record found at any of the probed selectors — pass ?selector=<your-selector>")
            ));
        }
        out.put("triedSelectors", outcome.triedSelectors());
        return out;
    }

    /** Resolve and analyse one selector. Accessible from the prober as
     *  a per-call strategy. */
    Map<String, Object> fetchOne(String domain, String selector) {
        Map<String, Object> r = new LinkedHashMap<>();
        String host = selector + "._domainkey." + domain;
        r.put("queriedHost", host);

        List<String> txts = txt(host);
        String dkim = txts.stream().filter(DkimRecordParser::looksLikeDkim).findFirst().orElse(null);
        if (dkim == null) { r.put("present", false); return r; }

        r.put("present", true);
        r.put("rawRecord", dkim);
        Map<String, String> tags = DkimRecordParser.parseTags(dkim);
        List<String> hashAlgs = DkimRecordParser.parseHashAlgs(tags.get("h"));
        boolean revoked = tags.get("p") != null && tags.get("p").isBlank();

        r.put("tags", tags);
        r.put("keyType", tags.getOrDefault("k", "rsa"));
        r.put("serviceType", tags.getOrDefault("s", "*"));
        r.put("flags", tags.getOrDefault("t", ""));
        r.put("hashAlgorithms", hashAlgs);
        r.put("notes", tags.get("n"));
        r.put("revoked", revoked);

        DkimKeyDecoder.PubKeyInfo info = null;
        String pBase64 = tags.get("p");
        if (!revoked && pBase64 != null) {
            try {
                info = DkimKeyDecoder.decode(pBase64, (String) r.get("keyType"));
                r.put("publicKeyBase64", pBase64);
                r.put("keySize", info.bits());
                r.put("keyAlgorithm", info.algorithm());
            } catch (Exception ignored) { /* warning generator handles null */ }
        }
        r.put("warnings", DkimWarningCheck.evaluate(tags, info, hashAlgs, revoked));
        return r;
    }

    /* Package-private shims for existing tests (parser + decoder are
     * the real owners; these delegate so legacy DkimControllerTest calls
     * keep compiling). */
    static Map<String, String> parseTags(String r)      { return DkimRecordParser.parseTags(r); }
    static List<String> parseHashAlgs(String h)         { return DkimRecordParser.parseHashAlgs(h); }
    static DkimKeyDecoder.PubKeyInfo decodeKey(String b, String t) throws Exception {
        return DkimKeyDecoder.decode(b, t);
    }

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
