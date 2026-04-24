package io.netscope.pageinsight;

import io.netscope.common.ApiException;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/v1/opengraph")
public class OpenGraphController {

    private static final Pattern META = Pattern.compile(
        "<meta\\s+[^>]*?(?:name|property)=[\"']([^\"']+)[\"'][^>]*?content=[\"']([^\"']*)[\"']",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern META_REV = Pattern.compile(
        "<meta\\s+[^>]*?content=[\"']([^\"']*)[\"'][^>]*?(?:name|property)=[\"']([^\"']+)[\"']",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern TITLE = Pattern.compile("<title[^>]*>([^<]*)</title>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ICON  = Pattern.compile(
        "<link\\s+[^>]*?rel=[\"'](?:icon|shortcut icon|apple-touch-icon)[\"'][^>]*?href=[\"']([^\"']+)[\"']",
        Pattern.CASE_INSENSITIVE);

    private final PageFetcher fetcher;
    public OpenGraphController(PageFetcher fetcher) { this.fetcher = fetcher; }

    @GetMapping
    public Map<String, Object> preview(@RequestParam String url) {
        try {
            PageFetcher.Fetched f = fetcher.fetch(url);
            String body = f.body();

            Map<String, String> meta = new LinkedHashMap<>();
            scan(META, body, meta);
            scan(META_REV, body, meta);

            String title = meta.getOrDefault("og:title",
                meta.getOrDefault("twitter:title", firstGroup(TITLE, body)));
            String description = meta.getOrDefault("og:description",
                meta.getOrDefault("twitter:description", meta.get("description")));
            String image = meta.getOrDefault("og:image", meta.get("twitter:image"));
            String iconHref = firstGroup(ICON, body);
            String favicon = resolve(f.url().toString(), iconHref != null ? iconHref : "/favicon.ico");

            List<String> warnings = new ArrayList<>();
            if (title == null) warnings.add("No <title> or og:title — bad for sharing + SEO");
            if (description == null) warnings.add("No meta description / og:description");
            if (image == null) warnings.add("No og:image — previews will be bare");
            if (!meta.containsKey("twitter:card")) warnings.add("No twitter:card — Twitter preview may be small");

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("url", f.url().toString());
            out.put("title", title);
            out.put("description", description);
            out.put("image", image == null ? null : resolve(f.url().toString(), image));
            out.put("favicon", favicon);
            out.put("siteName", meta.get("og:site_name"));
            out.put("type", meta.get("og:type"));
            out.put("twitterCard", meta.get("twitter:card"));
            out.put("allMeta", meta);
            out.put("warnings", warnings);
            return out;
        } catch (Exception e) {
            throw ApiException.badRequest("fetch failed: " + e.getMessage());
        }
    }

    private void scan(Pattern p, String body, Map<String, String> out) {
        Matcher m = p.matcher(body);
        while (m.find()) {
            String key, val;
            if (p == META) { key = m.group(1); val = m.group(2); }
            else            { key = m.group(2); val = m.group(1); }
            out.putIfAbsent(key.toLowerCase(), val);
        }
    }

    private String firstGroup(Pattern p, String body) {
        Matcher m = p.matcher(body);
        return m.find() ? m.group(1).trim() : null;
    }

    private String resolve(String base, String ref) {
        if (ref == null) return null;
        try { return java.net.URI.create(base).resolve(ref).toString(); }
        catch (Exception e) { return ref; }
    }
}
