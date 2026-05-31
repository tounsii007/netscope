package io.netscope.pageinsight;

import io.netscope.common.errors.ApiException;
import io.netscope.common.http.SafeHttpClient;
import io.netscope.common.security.TargetValidator;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/robots")
public class RobotsController {

    private static final Pattern LOC = Pattern.compile("<loc>([^<]+)</loc>", Pattern.CASE_INSENSITIVE);

    /** F-RD2-06: hard wall-clock budget so an attacker-controlled robots.txt
     *  can't keep us looping through sitemap fetches indefinitely. */
    private static final Duration ANALYZE_BUDGET = Duration.ofSeconds(30);

    /** Timeout for the single robots.txt fetch — quick because the file is
     *  always small + cacheable on the origin. */
    private static final Duration ROBOTS_FETCH_TIMEOUT = Duration.ofSeconds(8);

    /** Timeout for each sitemap fetch — slightly longer because sitemap
     *  XML can be larger and sometimes generated on demand. */
    private static final Duration SITEMAP_FETCH_TIMEOUT = Duration.ofSeconds(10);

    /** Cap on the raw robots.txt body bytes the API echoes back to callers.
     *  Anything longer is almost certainly noise from a misconfigured CMS. */
    private static final int ROBOTS_RAW_PREVIEW_CHARS = 10_000;

    /** Cap on the number of Sitemap: entries we follow per robots.txt. */
    private static final int SITEMAP_MAX_ENTRIES = 20;

    /** Cap on the URL count surfaced per sitemap response. */
    private static final int SITEMAP_MAX_URLS = 500;

    private final SafeHttpClient http;
    private final TargetValidator validator;

    public RobotsController(SafeHttpClient http, TargetValidator v) {
        this.http = http; this.validator = v;
    }

    @GetMapping("/{host}")
    public Map<String, Object> analyze(@PathVariable String host) {
        validator.resolveAndValidate(host);

        Map<String, Object> robots = fetchRobots(host);
        List<String> sitemapUrls = (List<String>) robots.getOrDefault("sitemaps", List.of());
        if (sitemapUrls.isEmpty()) sitemapUrls = List.of("https://" + host + "/sitemap.xml");

        // F-RD2-06: hard wall-clock budget so an attacker-controlled robots.txt
        // can't keep us looping through sitemap fetches indefinitely.
        long startNanos = System.nanoTime();
        long budgetNanos = ANALYZE_BUDGET.toNanos();
        List<Map<String, Object>> sitemaps = new ArrayList<>();
        boolean truncated = false;
        for (String sm : sitemapUrls) {
            if (System.nanoTime() - startNanos > budgetNanos) {
                truncated = true;
                break;
            }
            sitemaps.add(fetchSitemap(sm));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("host", host);
        out.put("robots", robots);
        out.put("sitemaps", sitemaps);
        if (truncated) out.put("note", "truncated due to time budget");
        return out;
    }

    private Map<String, Object> fetchRobots(String host) {
        Map<String, Object> out = new LinkedHashMap<>();
        String url = "https://" + host + "/robots.txt";
        try {
            HttpResponse<String> res = http.send(
                HttpRequest.newBuilder(URI.create(url)).timeout(ROBOTS_FETCH_TIMEOUT).GET().build(),
                HttpResponse.BodyHandlers.ofString());
            out.put("url", url);
            out.put("status", res.statusCode());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                String body = res.body() == null ? "" : res.body();
                out.put("raw", body.length() > ROBOTS_RAW_PREVIEW_CHARS
                    ? body.substring(0, ROBOTS_RAW_PREVIEW_CHARS) : body);
                parseRobots(body, out);
            } else {
                out.put("error", "HTTP " + res.statusCode());
            }
        } catch (Exception e) {
            out.put("error", e.getClass().getSimpleName());
        }
        return out;
    }

    private void parseRobots(String body, Map<String, Object> out) {
        Map<String, List<String>> agents = new LinkedHashMap<>();
        List<String> sitemaps = new ArrayList<>();
        String currentAgent = "*";
        for (String line : body.split("\n")) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            int idx = line.indexOf(':');
            if (idx < 0) continue;
            String k = line.substring(0, idx).trim().toLowerCase();
            String v = line.substring(idx + 1).trim();
            switch (k) {
                case "user-agent" -> currentAgent = v;
                case "sitemap"    -> sitemaps.add(v);
                case "disallow"   -> agents.computeIfAbsent("disallow:" + currentAgent, x -> new ArrayList<>()).add(v);
                case "allow"      -> agents.computeIfAbsent("allow:" + currentAgent,    x -> new ArrayList<>()).add(v);
                case "crawl-delay"-> agents.computeIfAbsent("crawl-delay:" + currentAgent, x -> new ArrayList<>()).add(v);
                default -> { }
            }
        }
        out.put("rules", agents);
        // F-RD2-06: dedup + cap sitemap entries — robots.txt is attacker-controlled
        // and we don't want to iterate an unbounded list downstream.
        out.put("sitemaps", sitemaps.stream().distinct().limit(SITEMAP_MAX_ENTRIES).collect(Collectors.toList()));

        List<String> warnings = new ArrayList<>();
        if (sitemaps.isEmpty()) warnings.add("No Sitemap: directive — crawlers may miss content");
        boolean disallowAll = agents.getOrDefault("disallow:*", List.of()).stream().anyMatch("/"::equals);
        if (disallowAll) warnings.add("Disallow: / for * — site hidden from all crawlers");
        out.put("warnings", warnings);
    }

    private Map<String, Object> fetchSitemap(String url) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("url", url);
        try {
            URI uri = URI.create(url);
            validator.resolveAndValidate(uri.getHost());
            HttpResponse<String> res = http.send(
                HttpRequest.newBuilder(uri).timeout(SITEMAP_FETCH_TIMEOUT).GET().build(),
                HttpResponse.BodyHandlers.ofString());
            out.put("status", res.statusCode());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                String body = res.body() == null ? "" : res.body();
                List<String> urls = new ArrayList<>();
                Matcher m = LOC.matcher(body);
                while (m.find() && urls.size() < SITEMAP_MAX_URLS) urls.add(m.group(1).trim());
                out.put("urlCount", urls.size());
                out.put("sample", urls.subList(0, Math.min(20, urls.size())));
                out.put("isIndex", body.contains("<sitemapindex"));
            } else {
                out.put("error", "HTTP " + res.statusCode());
            }
        } catch (Exception e) {
            out.put("error", e.getClass().getSimpleName());
        }
        return out;
    }
}
