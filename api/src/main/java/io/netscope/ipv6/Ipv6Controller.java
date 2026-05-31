package io.netscope.ipv6;

import io.netscope.common.errors.ApiException;
import io.netscope.common.BoundedDns;
import io.netscope.common.security.DomainNormaliser;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.util.*;

/**
 * Scores IPv6 readiness by checking AAAA presence on apex, www, and key MX/NS
 * targets. A site with full IPv6 on all fronts scores 100.
 */
@RestController
@RequestMapping("/api/v1/ipv6")
public class Ipv6Controller {

    @GetMapping("/{domain}")
    public Map<String, Object> score(@PathVariable String domain) {
        domain = DomainNormaliser.toAscii(domain);
        if (domain == null || !domain.matches("^(?!.*\\.\\.)[a-zA-Z0-9.-]{1,253}$")) {
            throw ApiException.badRequest("invalid domain");
        }

        boolean apex6 = hasAaaa(domain);
        boolean apex4 = hasA(domain);
        boolean www6 = hasAaaa("www." + domain);
        boolean www4 = hasA("www." + domain);

        List<String> nsHosts = records(domain, Type.NS);
        List<String> mxHosts = mxTargets(domain);

        int ns6 = (int) nsHosts.stream().filter(this::hasAaaa).count();
        int mx6 = (int) mxHosts.stream().filter(this::hasAaaa).count();

        int score = 0;
        if (apex6) score += 30;
        if (www6) score += 20;
        if (!nsHosts.isEmpty()) score += Math.round(25f * ns6 / nsHosts.size());
        if (!mxHosts.isEmpty()) score += Math.round(25f * mx6 / mxHosts.size());

        List<String> warnings = new ArrayList<>();
        if (!apex6) warnings.add("No AAAA on apex — users on IPv6-only networks (mobile) can't reach your site");
        if (!www6) warnings.add("No AAAA on www.");
        if (!nsHosts.isEmpty() && ns6 == 0) warnings.add("None of your nameservers have IPv6");
        if (!mxHosts.isEmpty() && mx6 == 0) warnings.add("No MX with IPv6 — email from IPv6-only senders may be delayed");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("score", score);
        out.put("apex", Map.of("a", apex4, "aaaa", apex6));
        out.put("www",  Map.of("a", www4, "aaaa", www6));
        out.put("nameservers", Map.of("total", nsHosts.size(), "withIpv6", ns6, "hosts", nsHosts));
        out.put("mxRecords",   Map.of("total", mxHosts.size(), "withIpv6", mx6, "hosts", mxHosts));
        out.put("warnings", warnings);
        return out;
    }

    private boolean hasAaaa(String host) { return !records(host, Type.AAAA).isEmpty(); }
    private boolean hasA(String host)    { return !records(host, Type.A).isEmpty(); }

    private List<String> records(String host, int type) {
        try {
            Record[] recs = BoundedDns.run(host, type);
            if (recs == null) return List.of();
            List<String> out = new ArrayList<>();
            for (Record r : recs) {
                if (type == Type.NS && r instanceof NSRecord n) out.add(n.getTarget().toString(true));
                else out.add(r.rdataToString());
            }
            return out;
        } catch (Exception e) { return List.of(); }
    }

    private List<String> mxTargets(String domain) {
        try {
            Record[] recs = BoundedDns.run(domain, Type.MX);
            if (recs == null) return List.of();
            List<String> out = new ArrayList<>();
            for (Record r : recs) if (r instanceof MXRecord m) out.add(m.getTarget().toString(true));
            return out;
        } catch (Exception e) { return List.of(); }
    }
}
