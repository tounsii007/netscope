package io.netscope.user;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

/**
 * Reads `Authorization: Bearer <jwt>` and populates SessionContext. Runs after
 * RateLimitFilter so anonymous rate-limits apply until auth succeeds. Order is
 * important: we want API-key auth AND session auth to coexist — the ApiKeyFilter
 * runs first for backend tokens; user JWTs take over when present.
 */
@Component
@Order(2)
public class SessionFilter extends OncePerRequestFilter {

    private final JwtService jwt;

    public SessionFilter(JwtService jwt) { this.jwt = jwt; }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        try {
            String auth = req.getHeader("Authorization");
            if (auth != null && auth.startsWith("Bearer ")) {
                Map<String, Object> claims = jwt.parse(auth.substring(7));
                if (claims != null) {
                    // F-RD3-02: a malformed sub (non-UUID) used to bubble
                    // an IllegalArgumentException out of this filter as a
                    // 500. Treat it as "no session" and let downstream auth
                    // return a clean 401 instead of leaking an internal error.
                    UUID userId;
                    try {
                        userId = UUID.fromString(String.valueOf(claims.get("sub")));
                    } catch (IllegalArgumentException e) {
                        chain.doFilter(req, res);
                        return;
                    }
                    String email = String.valueOf(claims.get("email"));
                    SessionContext.set(new SessionContext.Session(userId, email));
                }
            }
            chain.doFilter(req, res);
        } finally {
            SessionContext.clear();
        }
    }
}
