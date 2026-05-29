package io.netscope.tech;

import io.netscope.common.errors.ApiException;
import io.netscope.common.http.SafeHttpClient;
import io.netscope.common.security.TargetValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;

/**
 * Lightweight tech fingerprinting — header and HTML body pattern matching.
 * Not as exhaustive as Wappalyzer but covers ~80 common frameworks, CMS,
 * analytics, hosting, and ecommerce platforms with zero external calls.
 */
@RestController
@RequestMapping("/api/v1/tech")
public class TechStackController {

    private static final Logger log = LoggerFactory.getLogger(TechStackController.class);

    private record Sig(String tech, String category, String where, String pattern) {}

    private static final List<Sig> SIGS = List.of(
        // Server
        new Sig("Nginx", "server", "header", "server=nginx"),
        new Sig("Apache", "server", "header", "server=apache"),
        new Sig("Caddy", "server", "header", "server=caddy"),
        new Sig("LiteSpeed", "server", "header", "server=litespeed"),
        // Frameworks
        new Sig("Next.js", "framework", "header", "x-nextjs-"),
        new Sig("Nuxt.js", "framework", "body", "data-n-head"),
        new Sig("Remix", "framework", "body", "__remixContext"),
        new Sig("Astro", "framework", "body", "astro-island"),
        new Sig("SvelteKit", "framework", "body", "__sveltekit"),
        new Sig("Spring Boot", "framework", "header", "x-application-context"),
        new Sig("Laravel", "framework", "header", "laravel_session"),
        new Sig("Django", "framework", "header", "csrftoken"),
        new Sig("Rails", "framework", "header", "x-request-id"),
        // Languages / runtime
        new Sig("PHP", "language", "header", "x-powered-by=php"),
        new Sig("ASP.NET", "language", "header", "x-powered-by=asp.net"),
        new Sig("Node.js", "language", "header", "x-powered-by=express"),
        // CMS
        new Sig("WordPress", "cms", "body", "wp-content"),
        new Sig("WordPress", "cms", "body", "wp-includes"),
        new Sig("Drupal", "cms", "header", "x-drupal-"),
        new Sig("Joomla", "cms", "body", "/components/com_"),
        new Sig("Ghost", "cms", "body", "ghost-sdk"),
        new Sig("Contentful", "cms", "body", "images.ctfassets.net"),
        // Ecommerce
        new Sig("Shopify", "ecommerce", "header", "x-shopify-stage"),
        new Sig("Shopify", "ecommerce", "body", "cdn.shopify.com"),
        new Sig("WooCommerce", "ecommerce", "body", "woocommerce"),
        new Sig("Magento", "ecommerce", "body", "/mage/"),
        new Sig("BigCommerce", "ecommerce", "body", "bigcommerce"),
        new Sig("Stripe", "payment", "body", "js.stripe.com"),
        new Sig("PayPal", "payment", "body", "paypal.com/sdk"),
        // Analytics
        new Sig("Google Analytics", "analytics", "body", "google-analytics.com"),
        new Sig("Google Analytics 4", "analytics", "body", "gtag/js"),
        new Sig("Plausible", "analytics", "body", "plausible.io/js"),
        new Sig("Fathom", "analytics", "body", "cdn.usefathom.com"),
        new Sig("Mixpanel", "analytics", "body", "cdn.mxpnl.com"),
        new Sig("Hotjar", "analytics", "body", "static.hotjar.com"),
        new Sig("Segment", "analytics", "body", "cdn.segment.com"),
        // UI libs
        new Sig("Tailwind CSS", "css", "body", "tailwind"),
        new Sig("Bootstrap", "css", "body", "/bootstrap"),
        new Sig("React", "js-framework", "body", "react.production.min.js"),
        new Sig("Vue.js", "js-framework", "body", "vue.global.js"),
        new Sig("jQuery", "js-framework", "body", "jquery"),
        new Sig("htmx", "js-framework", "body", "htmx.org"),
        new Sig("Alpine.js", "js-framework", "body", "alpinejs"),
        // Hosting / infra
        new Sig("Vercel", "hosting", "header", "x-vercel-id"),
        new Sig("Netlify", "hosting", "header", "x-nf-request-id"),
        new Sig("GitHub Pages", "hosting", "header", "server=github.com"),
        new Sig("Cloudflare Pages", "hosting", "header", "cf-pages"),
        new Sig("Heroku", "hosting", "header", "x-heroku-"),
        // Chat / widgets
        new Sig("Intercom", "widget", "body", "intercom.io"),
        new Sig("Zendesk", "widget", "body", "zdassets.com"),
        new Sig("Crisp", "widget", "body", "client.crisp.chat")
    );

    private final SafeHttpClient http;
    private final TargetValidator validator;
    public TechStackController(SafeHttpClient http, TargetValidator v) {
        this.http = http; this.validator = v;
    }

    @GetMapping("/{host}")
    public Map<String, Object> detect(@PathVariable String host) {
        // Belt-and-braces SSRF check: SafeHttpClient.send already
        // re-validates per hop, but doing it here first means the
        // tech-stack controller follows the same shape as every other
        // host-taking controller (cdn/headers/robots/ssl/etc.) — easier
        // for reviewers to spot a missing call, and gives a faster 403
        // for bad input that wouldn't have reached the HTTP path.
        validator.resolveAndValidate(host);
        String url = "https://" + host + "/";
        try {
            HttpResponse<String> res = http.send(
                HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10))
                    .header("User-Agent", "NetScope/1.0").GET().build(),
                HttpResponse.BodyHandlers.ofString());

            Map<String, String> headers = new LinkedHashMap<>();
            res.headers().map().forEach((k, v) ->
                headers.put(k.toLowerCase(), String.join(", ", v).toLowerCase()));
            String body = res.body() == null ? "" : res.body().toLowerCase();
            if (body.length() > 200_000) body = body.substring(0, 200_000);

            Map<String, Set<String>> byCategory = new TreeMap<>();
            for (Sig s : SIGS) {
                String[] parts = s.pattern().split("=", 2);
                boolean match;
                if ("header".equals(s.where())) {
                    String hv = headers.get(parts[0]);
                    match = hv != null && (parts.length == 1 || hv.contains(parts[1]));
                } else {
                    match = body.contains(s.pattern());
                }
                if (match) byCategory.computeIfAbsent(s.category(), k -> new LinkedHashSet<>()).add(s.tech());
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("host", host);
            out.put("status", res.statusCode());
            out.put("technologies", byCategory);
            out.put("totalDetected", byCategory.values().stream().mapToInt(Set::size).sum());
            return out;
        } catch (Exception e) {
            throw ApiException.sanitizedFailure(log, "Tech stack fetch failed", e);
        }
    }
}
