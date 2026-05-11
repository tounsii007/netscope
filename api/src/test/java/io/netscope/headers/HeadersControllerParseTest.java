package io.netscope.headers;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure-unit tests for the HSTS and CSP parsers on {@link HeadersController}.
 *
 * Both parsers are package-private statics; we reach them via reflection
 * so we don't have to widen visibility just for tests. The headers
 * endpoint itself is integration-tested elsewhere (it needs MSW + a
 * SafeHttpClient, both of which require Spring); the parsers themselves
 * are pure-string-in / map-out and shouldn't pay that boot cost.
 */
class HeadersControllerParseTest {

    /* ── HSTS ────────────────────────────────────────────────────────── */

    @Test void hstsMaxAgeOnly() throws Exception {
        Map<String, Object> m = parseHsts("max-age=31536000");
        assertThat(m).containsEntry("maxAge", 31_536_000L)
                     .containsEntry("includeSubDomains", false)
                     .containsEntry("preload", false)
                     .containsEntry("preloadEligible", false);
    }

    @Test void hstsFullPolicy() throws Exception {
        Map<String, Object> m = parseHsts("max-age=31536000; includeSubDomains; preload");
        assertThat(m).containsEntry("maxAge", 31_536_000L)
                     .containsEntry("includeSubDomains", true)
                     .containsEntry("preload", true)
                     .containsEntry("preloadEligible", true);
    }

    @Test void hstsCaseInsensitive() throws Exception {
        Map<String, Object> m = parseHsts("Max-Age=63072000; IncludeSubDomains; PRELOAD");
        assertThat(m).containsEntry("maxAge", 63_072_000L)
                     .containsEntry("includeSubDomains", true)
                     .containsEntry("preload", true)
                     .containsEntry("preloadEligible", true);
    }

    @Test void hstsZeroMaxAgeIsNotPreloadEligible() throws Exception {
        Map<String, Object> m = parseHsts("max-age=0; includeSubDomains; preload");
        assertThat(m).containsEntry("maxAge", 0L)
                     .containsEntry("preloadEligible", false);
    }

    @Test void hstsShortMaxAgeIsNotPreloadEligible() throws Exception {
        Map<String, Object> m = parseHsts("max-age=86400; includeSubDomains; preload");
        // 1 day << 1 year — Mozilla's preload list won't accept it.
        assertThat(m).containsEntry("maxAge", 86_400L)
                     .containsEntry("preloadEligible", false);
    }

    @Test void hstsMissingMaxAgeIsHandled() throws Exception {
        Map<String, Object> m = parseHsts("includeSubDomains");
        assertThat(m).containsEntry("maxAge", -1L)
                     .containsEntry("includeSubDomains", true)
                     .containsEntry("preload", false);
    }

    @Test void hstsGarbageMaxAgeIsHandled() throws Exception {
        Map<String, Object> m = parseHsts("max-age=lol");
        assertThat(m).containsEntry("maxAge", -1L);
    }

    /* ── CSP ─────────────────────────────────────────────────────────── */

    @Test void cspDetectsUnsafeInline() throws Exception {
        Map<String, Object> m = parseCsp("default-src 'self'; script-src 'self' 'unsafe-inline'");
        assertThat(m).containsEntry("hasUnsafeInline", true)
                     .containsEntry("hasUnsafeEval", false);
    }

    @Test void cspDetectsUnsafeEval() throws Exception {
        Map<String, Object> m = parseCsp("script-src 'self' 'unsafe-eval'");
        assertThat(m).containsEntry("hasUnsafeEval", true);
    }

    @Test void cspDetectsWildcardDefault() throws Exception {
        Map<String, Object> m = parseCsp("default-src *");
        assertThat(m).containsEntry("hasWildcard", true);
    }

    @Test void cspDirectiveCount() throws Exception {
        Map<String, Object> m = parseCsp(
            "default-src 'self'; script-src 'self'; img-src 'self' data:; style-src 'self'");
        assertThat(m).containsEntry("directiveCount", 4);
    }

    @Test void cspWithoutAnyUnsafeKeywordsIsClean() throws Exception {
        Map<String, Object> m = parseCsp("default-src 'self'; img-src 'self' data:");
        assertThat(m).containsEntry("hasUnsafeInline", false)
                     .containsEntry("hasUnsafeEval", false)
                     .containsEntry("hasWildcard", false);
    }

    /* ── reflection bridge ───────────────────────────────────────────── */

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseHsts(String raw) throws Exception {
        Method m = HeadersController.class.getDeclaredMethod("parseHsts", String.class);
        m.setAccessible(true);
        return (Map<String, Object>) m.invoke(null, raw);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseCsp(String raw) throws Exception {
        Method m = HeadersController.class.getDeclaredMethod("parseCsp", String.class);
        m.setAccessible(true);
        return (Map<String, Object>) m.invoke(null, raw);
    }
}
