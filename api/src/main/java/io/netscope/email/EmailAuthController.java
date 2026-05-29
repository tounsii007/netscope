package io.netscope.email;

import io.netscope.common.ApiException;
import io.netscope.common.BoundedDns;
import io.netscope.common.DomainNormaliser;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.util.*;

/**
 * Parses SPF (TXT on the domain), DMARC (TXT on _dmarc.domain) and optionally
 * DKIM (TXT on selector._domainkey.domain). Reports quality and common misconfigurations.
 */
@RestController
@RequestMapping("/api/v1/email-auth")
public class EmailAuthController {

    @GetMapping("/{domain}")
    public Map<String, Object> analyze(
            @PathVariable String domain,
            @RequestParam(required = false) String dkimSelector) {
        // IDN canonicalisation before the ASCII regex. See
        // DomainNormaliser for the strictness policy.
        domain = DomainNormaliser.toAscii(domain);
        if (domain == null || !domain.matches("^[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("spf", analyzeSpf(domain));
        out.put("dmarc", analyzeDmarc(domain));
        out.put("dkim", analyzeDkim(domain, dkimSelector));
        out.put("score", computeScore(out));
        return out;
    }

    private Map<String, Object> analyzeSpf(String domain) {
        Map<String, Object> r = new LinkedHashMap<>();
        List<String> txts = txt(domain);
        String spf = txts.stream().filter(t -> t.startsWith("v=spf1")).findFirst().orElse(null);
        r.put("present", spf != null);
        r.put("record", spf);
        if (spf == null) { r.put("warnings", List.of("No SPF record found")); return r; }

        List<String> w = new ArrayList<>();
        if (!spf.endsWith(" ~all") && !spf.endsWith(" -all")) w.add("Missing '-all' or '~all' terminator");
        if (spf.endsWith(" +all")) w.add("DANGEROUS: '+all' allows anyone to send");
        int lookups = (int) spf.chars().filter(c -> c == ':').count();
        if (lookups > 10) w.add("Too many DNS lookups (>10 limit)");
        r.put("strict", spf.endsWith(" -all"));
        r.put("warnings", w);
        return r;
    }

    private Map<String, Object> analyzeDmarc(String domain) {
        Map<String, Object> r = new LinkedHashMap<>();
        List<String> txts = txt("_dmarc." + domain);
        String dmarc = txts.stream().filter(t -> t.startsWith("v=DMARC1")).findFirst().orElse(null);
        r.put("present", dmarc != null);
        r.put("record", dmarc);
        if (dmarc == null) { r.put("warnings", List.of("No DMARC record — spoofing protection missing")); return r; }

        Map<String, String> tags = new LinkedHashMap<>();
        for (String part : dmarc.split(";")) {
            String[] kv = part.trim().split("=", 2);
            if (kv.length == 2) tags.put(kv[0].trim(), kv[1].trim());
        }
        r.put("policy", tags.getOrDefault("p", "none"));
        r.put("subdomainPolicy", tags.getOrDefault("sp", tags.getOrDefault("p", "none")));
        r.put("percent", tags.getOrDefault("pct", "100"));
        r.put("reportingTo", tags.get("rua"));
        List<String> w = new ArrayList<>();
        if ("none".equals(tags.getOrDefault("p", "none"))) w.add("Policy is 'none' — monitor-only, no enforcement");
        if (tags.get("rua") == null) w.add("No aggregate report URI (rua=) — you won't see attempts");
        r.put("warnings", w);
        return r;
    }

    private Map<String, Object> analyzeDkim(String domain, String selector) {
        Map<String, Object> r = new LinkedHashMap<>();
        if (selector == null || selector.isBlank()) {
            // Try common selectors
            for (String s : List.of("default", "google", "selector1", "selector2", "mail", "k1")) {
                List<String> txts = txt(s + "._domainkey." + domain);
                String dkim = txts.stream().filter(t -> t.contains("v=DKIM1")).findFirst().orElse(null);
                if (dkim != null) {
                    r.put("selector", s); r.put("record", dkim); r.put("present", true);
                    return r;
                }
            }
            r.put("present", false);
            r.put("warnings", List.of("No DKIM selector found — try passing ?dkimSelector=..."));
            return r;
        }
        List<String> txts = txt(selector + "._domainkey." + domain);
        String dkim = txts.stream().filter(t -> t.contains("v=DKIM1")).findFirst().orElse(null);
        r.put("selector", selector);
        r.put("present", dkim != null);
        r.put("record", dkim);
        return r;
    }

    private List<String> txt(String host) {
        try {
            Record[] recs = BoundedDns.run(host, Type.TXT);
            if (recs == null) return List.of();
            List<String> out = new ArrayList<>();
            for (Record r : recs) if (r instanceof TXTRecord t)
                out.add(String.join("", t.getStrings()));
            return out;
        } catch (Exception e) { return List.of(); }
    }

    private int computeScore(Map<String, Object> out) {
        int score = 0;
        @SuppressWarnings("unchecked") var spf = (Map<String, Object>) out.get("spf");
        @SuppressWarnings("unchecked") var dmarc = (Map<String, Object>) out.get("dmarc");
        @SuppressWarnings("unchecked") var dkim = (Map<String, Object>) out.get("dkim");
        if (Boolean.TRUE.equals(spf.get("present"))) { score += 30; if (Boolean.TRUE.equals(spf.get("strict"))) score += 10; }
        if (Boolean.TRUE.equals(dmarc.get("present"))) { score += 25; if (!"none".equals(dmarc.get("policy"))) score += 15; }
        if (Boolean.TRUE.equals(dkim.get("present"))) score += 20;
        return score;
    }
}
