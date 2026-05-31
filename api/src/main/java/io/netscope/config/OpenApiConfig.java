package io.netscope.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;
import io.swagger.v3.oas.annotations.servers.Server;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.context.annotation.Configuration;

/**
 * Branding + grouping for the auto-generated OpenAPI document at
 * {@code /v3/api-docs} (JSON) and the Swagger UI at {@code /swagger-ui}.
 *
 * Tag list mirrors the feature-package layout under
 * {@code io.netscope.*} so any new controller automatically lands in
 * the right group as long as it puts {@code @Tag(name = "…")} on the
 * class. Tags listed here without controllers using them are simply
 * empty groups in the UI — harmless.
 */
@Configuration
@OpenAPIDefinition(
    info = @Info(
        title = "Traceronix / NetScope API",
        version = "v1",
        description = """
            HTTP API for the Traceronix network-diagnostics platform.

            All endpoints are rooted at `/api/v1/`. Anonymous calls are
            rate-limited per source IP; authenticated calls (header
            `X-API-Key: …`) get a higher quota and additional fields
            on a few endpoints (see the per-tool descriptions).

            Errors follow a stable JSON envelope:
            ```
            { "error": "Bad Request", "message": "…", "timestamp": "…" }
            ```
            5xx responses carry an additional `correlationId` field —
            include it in any support request so we can locate the
            full stack trace in the server logs.
            """,
        contact = @Contact(name = "Traceronix Engineering",
                           url  = "https://traceronix.io"),
        license = @License(name = "Proprietary")),
    servers = {
        @Server(url = "https://api.traceronix.io", description = "Production"),
        @Server(url = "http://localhost:8080",    description = "Local development")
    },
    tags = {
        @Tag(name = "DNS",        description = "DNS lookup, propagation, DNSSEC, DoH"),
        @Tag(name = "SSL / TLS",  description = "Certificate inspection, CT logs, SSL grade"),
        @Tag(name = "IP",         description = "IP geolocation, multi-source comparison, BGP/ASN"),
        @Tag(name = "Web",        description = "HTTP headers, redirects, cookies, OpenGraph, robots"),
        @Tag(name = "Email",      description = "DKIM, DMARC, SPF, email-auth"),
        @Tag(name = "Network",    description = "Port checker, WebSocket probe, reachability, blacklist"),
        @Tag(name = "Account",    description = "Auth, billing, workspaces, API keys"),
        @Tag(name = "Telemetry",  description = "Client error log + Web Vitals ingest")
    }
)
public class OpenApiConfig {
}
