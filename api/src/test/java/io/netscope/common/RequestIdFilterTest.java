package io.netscope.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit-level tests for {@link RequestIdFilter}. The filter is tiny
 * and self-contained, so we cover its full contract without spinning
 * up the Spring container — keeps the test fast and runnable in
 * environments where Docker isn't available (Windows dev boxes,
 * sandboxed CI runners).
 *
 * We use Spring Test's MockHttpServletRequest/Response instead of
 * Mockito mocks: JaCoCo can't instrument Mockito's runtime-generated
 * subclasses on JDK 21 ("Unsupported class file major version 70"),
 * so coverage-enabled CI runs would crash before a single assertion
 * fired. The Spring mocks are plain Java classes JaCoCo handles fine.
 */
class RequestIdFilterTest {

    private final RequestIdFilter filter = new RequestIdFilter();

    @AfterEach void cleanMdc() {
        // Defensive — every test should already have cleared the MDC via
        // the filter's finally block. Belt-and-braces so a failing test
        // can't bleed state into the next one.
        MDC.clear();
    }

    @Test void generatesIdWhenNoneSupplied() throws IOException, ServletException {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/dns/example.com");
        MockHttpServletResponse res = new MockHttpServletResponse();
        IdCapturingChain chain = new IdCapturingChain();

        filter.doFilter(req, res, chain);

        String emitted = res.getHeader(RequestIdFilter.HEADER);
        assertThat(emitted).isNotNull();
        // 16 lowercase-hex characters — see RequestIdFilter#generate().
        assertThat(emitted).matches(Pattern.compile("^[a-f0-9]{16}$"));
        // The chain must have observed the same id in MDC while running.
        assertThat(chain.observedDuringChain).isEqualTo(emitted);
        // And the MDC must be cleared once doFilter returns — otherwise
        // the next request reused on this thread inherits the id.
        assertThat(MDC.get(RequestIdFilter.MDC_KEY)).isNull();
    }

    @Test void echoesInboundIdWhenItPassesThePattern() throws IOException, ServletException {
        String trusted = "01HJZX4NK0Y6F3Q2W1P8R5T7AB";  // ULID-shaped
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/dns/example.com");
        req.addHeader(RequestIdFilter.HEADER, trusted);
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, new MockFilterChain());

        assertThat(res.getHeader(RequestIdFilter.HEADER)).isEqualTo(trusted);
    }

    @Test void rejectsInboundIdWithNewlines() throws IOException, ServletException {
        // Log-injection attempt: the attacker tries to insert a fake
        // log line by embedding CRLF into X-Request-Id. The filter
        // must drop the inbound value and generate a fresh one.
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/dns/example.com");
        req.addHeader(RequestIdFilter.HEADER, "abc\r\n2025-01-01 FORGED ERROR");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, new MockFilterChain());

        String emitted = res.getHeader(RequestIdFilter.HEADER);
        assertThat(emitted).isNotNull();
        assertThat(emitted).doesNotContain("\n").doesNotContain("\r");
        assertThat(emitted).matches(Pattern.compile("^[a-f0-9]{16}$"));
    }

    @Test void rejectsInboundIdWithAnsiEscape() throws IOException, ServletException {
        // ANSI escape would let an attacker repaint the terminal of an
        // engineer tailing the log live — pattern blocks it.
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/dns/example.com");
        req.addHeader(RequestIdFilter.HEADER, "abc[31mFAKE");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, new MockFilterChain());

        assertThat(res.getHeader(RequestIdFilter.HEADER))
            .matches(Pattern.compile("^[a-f0-9]{16}$"));
    }

    @Test void rejectsInboundIdWithBrackets() throws IOException, ServletException {
        // ']' would let an attacker close the [requestId] field in the
        // log pattern and inject siblings.
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/dns/example.com");
        req.addHeader(RequestIdFilter.HEADER, "abc]forged[xyz");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, new MockFilterChain());

        assertThat(res.getHeader(RequestIdFilter.HEADER))
            .matches(Pattern.compile("^[a-f0-9]{16}$"));
    }

    @Test void rejectsTooShortInboundId() throws IOException, ServletException {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/dns/example.com");
        req.addHeader(RequestIdFilter.HEADER, "short");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, new MockFilterChain());

        assertThat(res.getHeader(RequestIdFilter.HEADER))
            .matches(Pattern.compile("^[a-f0-9]{16}$"));
    }

    @Test void rejectsTooLongInboundId() throws IOException, ServletException {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/dns/example.com");
        req.addHeader(RequestIdFilter.HEADER, "a".repeat(65));
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, new MockFilterChain());

        assertThat(res.getHeader(RequestIdFilter.HEADER))
            .matches(Pattern.compile("^[a-f0-9]{16}$"));
    }

    @Test void clearsMdcEvenIfChainThrows() {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/dns/example.com");
        MockHttpServletResponse res = new MockHttpServletResponse();
        FilterChain throwingChain = (rq, rs) -> { throw new ServletException("boom"); };

        try {
            filter.doFilter(req, res, throwingChain);
        } catch (Exception expected) {
            // The exception must bubble up — we only care that the MDC
            // is clean afterwards so the next request on this thread
            // doesn't inherit a stale correlation id.
        }
        assertThat(MDC.get(RequestIdFilter.MDC_KEY)).isNull();
    }

    @Test void filterRunsBeforeEverythingElse() {
        // Highest precedence — verified for the security-config wiring
        // contract. Without this ordering the rate-limit / api-key
        // filters would log without a correlation id.
        assertThat(filter.getOrder()).isEqualTo(Integer.MIN_VALUE);
    }

    @Test void twoRequestsOnSameThreadGetDistinctIds() throws IOException, ServletException {
        // Tomcat threads are pooled — the same OS thread services many
        // requests in succession. The filter must NOT carry an id over.
        MockHttpServletRequest req1 = new MockHttpServletRequest("GET", "/a");
        MockHttpServletResponse res1 = new MockHttpServletResponse();
        filter.doFilter(req1, res1, new MockFilterChain());

        MockHttpServletRequest req2 = new MockHttpServletRequest("GET", "/b");
        MockHttpServletResponse res2 = new MockHttpServletResponse();
        filter.doFilter(req2, res2, new MockFilterChain());

        String id1 = res1.getHeader(RequestIdFilter.HEADER);
        String id2 = res2.getHeader(RequestIdFilter.HEADER);
        assertThat(id1).isNotNull();
        assertThat(id2).isNotNull();
        assertThat(id1).isNotEqualTo(id2);
    }

    /** Chain that captures the MDC value mid-flight so we can assert
     *  the filter populated it BEFORE invoking the rest of the chain. */
    private static class IdCapturingChain implements FilterChain {
        String observedDuringChain;
        @Override public void doFilter(
                jakarta.servlet.ServletRequest rq, jakarta.servlet.ServletResponse rs) {
            observedDuringChain = MDC.get(RequestIdFilter.MDC_KEY);
        }
    }
}
