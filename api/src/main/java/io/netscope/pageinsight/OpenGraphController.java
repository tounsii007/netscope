package io.netscope.pageinsight;

import io.netscope.common.errors.ApiException;
import io.netscope.common.http.HttpUrlNormaliser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/v1/opengraph")
public class OpenGraphController {

    private static final Logger log = LoggerFactory.getLogger(OpenGraphController.class);

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
            // F-FE-01: scrub URL-bearing meta keys *before* they're echoed back
            // in allMeta or used to populate image/url fields. Any non-http(s)
            // scheme — javascript:, data:, file:, scheme-relative — is dropped.
            // We strip from the source map so both the typed top-level fields
            // and the catch-all allMeta object stay safe.
            scrubUrlMetaKeys(meta, f.url().toString());

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

            // F-FE-01: any URL we echo back into the JSON response that a client
            // might paste into <img src>, <a href>, link rel=icon, etc. must be
            // restricted to {http, https}. Attacker pages can otherwise smuggle
            // javascript:/data:/file: payloads through us via og:image,
            // twitter:image, og:url, or even a malicious <link rel=icon href=…>.
            // og:image / twitter:image were already resolved + allowlisted in
            // scrubUrlMetaKeys above; safeUrl() here is a defensive belt-and-
            // braces for the favicon (which comes from <link rel=icon>, not a
            // meta tag) and for the page URL itself.
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("url", safeUrl(f.url().toString()));
            out.put("title", title);
            out.put("description", description);
            out.put("image", safeUrl(image));
            out.put("favicon", safeUrl(favicon));
            out.put("siteName", meta.get("og:site_name"));
            out.put("type", meta.get("og:type"));
            out.put("twitterCard", meta.get("twitter:card"));
            out.put("allMeta", meta);
            out.put("warnings", warnings);
            return out;
        } catch (Exception e) {
            throw ApiException.sanitizedFailure(log, "OpenGraph fetch failed", e);
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

    /**
     * F-FE-01: scheme allowlist for any URL field we echo back to the client.
     * Returns the URL unchanged if it's {@code http://} / {@code https://},
     * otherwise null — callers should treat a dropped field as "no value".
     */
    private static String safeUrl(String url) {
        return HttpUrlNormaliser.isHttpUrl(url) ? url : null;
    }

    /**
     * F-FE-01: URL-bearing meta keys that, if echoed verbatim from a malicious
     * page, become a vector for client-side XSS / data-exfiltration. We resolve
     * each against the fetched page URL (so relative refs become absolute) and
     * drop any value whose scheme isn't on the {http, https} allowlist.
     */
    private static final Set<String> URL_META_KEYS = Set.of(
        "og:image", "og:image:url", "og:image:secure_url",
        "og:url", "og:video", "og:video:url", "og:video:secure_url",
        "og:audio", "og:audio:url", "og:audio:secure_url",
        "twitter:image", "twitter:image:src", "twitter:url", "twitter:player"
    );

    private void scrubUrlMetaKeys(Map<String, String> meta, String base) {
        for (String key : URL_META_KEYS) {
            String raw = meta.get(key);
            if (raw == null) continue;
            String resolved = resolve(base, raw);
            if (!HttpUrlNormaliser.isHttpUrl(resolved)) meta.remove(key);
            else meta.put(key, resolved);
        }
    }
}
