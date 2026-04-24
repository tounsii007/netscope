package io.netscope.auth;

import io.netscope.audit.SecurityAuditService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.Set;

/**
 * Validates the X-API-Key header if present. Routes under /api/v1/private/**
 * require a valid key. Public tool endpoints allow anonymous access and simply
 * get stricter per-IP rate limiting.
 */
@Component
@Order(1)
public class ApiKeyFilter extends OncePerRequestFilter {

    private static final Set<String> PRIVATE_PREFIXES = Set.of(
        "/api/v1/monitor", "/api/v1/bulk", "/api/v1/private"
    );

    private final ApiKeyService service;
    private final SecurityAuditService audit;

    public ApiKeyFilter(ApiKeyService service, SecurityAuditService audit) {
        this.service = service; this.audit = audit;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String path = req.getRequestURI();
        String header = req.getHeader("X-API-Key");

        try {
            if (header != null && !header.isBlank()) {
                var resolved = service.resolve(header);
                if (resolved.isPresent()) {
                    ApiKeyContext.set(resolved.get());
                } else {
                    audit.record("api_key.invalid", SecurityAuditService.Severity.WARN,
                        req, null, Map.of("path", path, "key_prefix",
                            header.substring(0, Math.min(6, header.length()))));
                }
            }

            if (ApiKeyContext.get() == null && requiresAuth(path)) {
                audit.record("auth.unauthorized", SecurityAuditService.Severity.INFO,
                    req, null, Map.of("path", path));
                res.setStatus(401);
                res.setContentType("application/json");
                res.getWriter().write("{\"error\":\"Unauthorized\",\"message\":\"valid X-API-Key required\"}");
                return;
            }
            chain.doFilter(req, res);
        } finally {
            ApiKeyContext.clear();
        }
    }

    private boolean requiresAuth(String path) {
        return PRIVATE_PREFIXES.stream().anyMatch(path::startsWith);
    }
}
