package io.netscope.pageinsight;

import io.netscope.common.ApiException;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses Set-Cookie headers and scans HTML for known third-party trackers.
 * Flags cookies without Secure / HttpOnly / SameSite — a GDPR/CSRF hazard.
 */
@RestController
@RequestMapping("/api/v1/cookies")
public class CookieController {

    private record Tracker(String name, String category, String pattern) {}

    private static final List<Tracker> TRACKERS = List.of(
        new Tracker("Google Analytics", "analytics", "google-analytics.com"),
        new Tracker("Google Tag Manager", "analytics", "googletagmanager.com"),
        new Tracker("Facebook Pixel", "ads", "connect.facebook.net"),
        new Tracker("LinkedIn Insight", "ads", "snap.licdn.com"),
        new Tracker("Twitter Pixel", "ads", "static.ads-twitter.com"),
        new Tracker("TikTok Pixel", "ads", "analytics.tiktok.com"),
        new Tracker("Hotjar", "analytics", "static.hotjar.com"),
        new Tracker("Mixpanel", "analytics", "cdn.mxpnl.com"),
        new Tracker("Segment", "analytics", "cdn.segment.com"),
        new Tracker("Intercom", "chat", "intercom.io"),
        new Tracker("HubSpot", "marketing", "hs-scripts.com"),
        new Tracker("Cloudflare Insights", "analytics", "static.cloudflareinsights.com"),
        new Tracker("Plausible", "analytics", "plausible.io"),
        new Tracker("Fathom", "analytics", "usefathom.com")
    );

    private static final Pattern URL_ATTR = Pattern.compile(
        "(?:src|href)=[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);

    private final PageFetcher fetcher;
    public CookieController(PageFetcher fetcher) { this.fetcher = fetcher; }

    @GetMapping
    public Map<String, Object> analyze(@RequestParam String url) {
        try {
            PageFetcher.Fetched f = fetcher.fetch(url);

            List<Map<String, Object>> cookies = new ArrayList<>();
            List<String> setCookies = f.headers().getOrDefault("set-cookie",
                f.headers().getOrDefault("Set-Cookie", List.of()));
            for (String c : setCookies) cookies.add(parseCookie(c));

            Set<String> trackerDomains = new LinkedHashSet<>();
            List<Map<String, Object>> trackers = new ArrayList<>();
            String lowerBody = f.body().toLowerCase();
            for (Tracker t : TRACKERS) {
                if (lowerBody.contains(t.pattern())) {
                    trackerDomains.add(t.pattern());
                    trackers.add(Map.of("name", t.name(), "category", t.category(), "pattern", t.pattern()));
                }
            }

            Set<String> thirdPartyHosts = new TreeSet<>();
            String host = f.url().getHost();
            Matcher m = URL_ATTR.matcher(f.body());
            while (m.find()) {
                String ref = m.group(1);
                if (ref.startsWith("//")) ref = "https:" + ref;
                if (ref.startsWith("http")) {
                    try {
                        String refHost = java.net.URI.create(ref).getHost();
                        if (refHost != null && !refHost.endsWith(host)) thirdPartyHosts.add(refHost);
                    } catch (Exception ignored) {}
                }
            }

            long insecureCookies = cookies.stream()
                .filter(c -> !Boolean.TRUE.equals(c.get("secure"))).count();
            long noSameSite = cookies.stream()
                .filter(c -> c.get("sameSite") == null).count();

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("url", f.url().toString());
            out.put("cookies", cookies);
            out.put("cookieCount", cookies.size());
            out.put("insecureCookies", insecureCookies);
            out.put("cookiesWithoutSameSite", noSameSite);
            out.put("trackers", trackers);
            out.put("trackerCount", trackers.size());
            out.put("thirdPartyHosts", thirdPartyHosts);
            out.put("gdprRiskScore", Math.min(100, (int)(trackers.size() * 15 + insecureCookies * 10 + noSameSite * 5)));
            return out;
        } catch (Exception e) {
            throw ApiException.badRequest("fetch failed: " + e.getMessage());
        }
    }

    private Map<String, Object> parseCookie(String header) {
        Map<String, Object> c = new LinkedHashMap<>();
        String[] parts = header.split(";");
        if (parts.length == 0) return c;
        int eq = parts[0].indexOf('=');
        if (eq > 0) { c.put("name", parts[0].substring(0, eq).trim()); }
        for (int i = 1; i < parts.length; i++) {
            String p = parts[i].trim();
            String lower = p.toLowerCase();
            if (lower.equals("secure")) c.put("secure", true);
            else if (lower.equals("httponly")) c.put("httpOnly", true);
            else if (lower.startsWith("samesite=")) c.put("sameSite", p.substring(9));
            else if (lower.startsWith("domain=")) c.put("domain", p.substring(7));
            else if (lower.startsWith("path=")) c.put("path", p.substring(5));
            else if (lower.startsWith("max-age=")) c.put("maxAge", p.substring(8));
        }
        c.putIfAbsent("secure", false);
        c.putIfAbsent("httpOnly", false);
        return c;
    }
}
