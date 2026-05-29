package io.netscope.pageinsight;

import io.netscope.common.ApiException;
import io.netscope.common.HttpUrlNormaliser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Loads an HTTPS page and reports every http:// resource in script/img/link/iframe
 * attributes. Browsers will block or warn on these — silent breakage for users.
 */
@RestController
@RequestMapping("/api/v1/mixed-content")
public class MixedContentController {

    private static final Logger log = LoggerFactory.getLogger(MixedContentController.class);

    private static final Pattern RESOURCE = Pattern.compile(
        "<(script|img|link|iframe|source|video|audio|embed|object)\\b[^>]*?" +
        "(?:src|href|data)=[\"'](http://[^\"']+)[\"']",
        Pattern.CASE_INSENSITIVE);

    private final PageFetcher fetcher;
    public MixedContentController(PageFetcher fetcher) { this.fetcher = fetcher; }

    @GetMapping
    public Map<String, Object> scan(@RequestParam String url) {
        url = HttpUrlNormaliser.ensureHttpScheme(url);
        if (!url.toLowerCase().startsWith("https://")) throw ApiException.badRequest("target must be https://");

        try {
            PageFetcher.Fetched f = fetcher.fetch(url);

            Map<String, List<String>> byType = new TreeMap<>();
            Matcher m = RESOURCE.matcher(f.body());
            while (m.find()) {
                String type = m.group(1).toLowerCase();
                String ref = m.group(2);
                byType.computeIfAbsent(type, k -> new ArrayList<>()).add(ref);
            }

            int total = byType.values().stream().mapToInt(List::size).sum();
            int blocking = byType.getOrDefault("script", List.of()).size()
                + byType.getOrDefault("iframe", List.of()).size()
                + byType.getOrDefault("link", List.of()).size();

            List<String> warnings = new ArrayList<>();
            if (total == 0) warnings.add("No mixed content detected. This page loads cleanly over HTTPS.");
            if (blocking > 0) warnings.add(blocking + " resources will be hard-blocked by modern browsers (scripts, iframes, stylesheets)");
            if (total > blocking) warnings.add((total - blocking) + " passive resources (img/video) show a broken-lock indicator");

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("url", f.url().toString());
            out.put("totalInsecureResources", total);
            out.put("blockingResources", blocking);
            out.put("passiveResources", total - blocking);
            out.put("byType", byType);
            out.put("clean", total == 0);
            out.put("warnings", warnings);
            return out;
        } catch (Exception e) {
            throw ApiException.sanitizedFailure(log, "Mixed-content scan failed", e);
        }
    }
}
