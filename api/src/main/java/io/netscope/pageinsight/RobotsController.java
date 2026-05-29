package io.netscope.pageinsight;

import io.netscope.common.ApiException;
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

@RestController
@RequestMapping("/api/v1/robots")
public class RobotsController {

    private static final Pattern LOC = Pattern.compile("<loc>([^<]+)</loc>", Pattern.CASE_INSENSITIVE);

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

        List<Map<String, Object>> sitemaps = new ArrayList<>();
        for (String sm : sitemapUrls) sitemaps.add(fetchSitemap(sm));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("host", host);
        out.put("robots", robots);
        out.put("sitemaps", sitemaps);
        return out;
    }

    private Map<String, Object> fetchRobots(String host) {
        Map<String, Object> out = new LinkedHashMap<>();
        String url = "https://" + host + "/robots.txt";
        try {
            HttpResponse<String> res = http.send(
                HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(8)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
            out.put("url", url);
            out.put("status", res.statusCode());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                String body = res.body() == null ? "" : res.body();
                out.put("raw", body.length() > 10_000 ? body.substring(0, 10_000) : body);
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
        out.put("sitemaps", sitemaps);

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
                HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
            out.put("status", res.statusCode());
            if (res.statusCode() >= 200 && res.statusCode() < 300) {
                String body = res.body() == null ? "" : res.body();
                List<String> urls = new ArrayList<>();
                Matcher m = LOC.matcher(body);
                while (m.find() && urls.size() < 500) urls.add(m.group(1).trim());
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
