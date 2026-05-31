package io.netscope.user;

import io.netscope.common.security.ClientIpResolver;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Sign-in handshake entry point (F-RD3-03 fix).
 *
 * Why this endpoint exists:
 *
 *   Until this fix landed, /api/v1/auth/exchange accepted an opaque
 *   {provider, accessToken, idToken?} POST with no binding to a sign-in
 *   request the backend had agreed to. A captured access_token (from a
 *   malicious browser extension, referer leak, SDK log, or breach dump)
 *   could be POSTed directly to /exchange and would mint a netscope JWT.
 *   See F-RD3-03 + F-RD3-04 in docs/security-review-2026q2-round3.md.
 *
 *   POST /api/v1/auth/start is the new handshake. It mints two values
 *   the frontend MUST forward:
 *
 *     • {@code nonce}  — the OIDC {@code nonce} parameter the frontend
 *                        sends to the OAuth provider, then echoed back
 *                        by Google in the id_token's {@code nonce} claim.
 *                        F-RD3-04 binds id_tokens to this value at
 *                        /exchange so a replayed token from a different
 *                        sign-in can't be accepted.
 *     • {@code ticket} — a one-shot HMAC-signed credential bound to a
 *                        ticket id, expiry, the nonce, AND the requester's
 *                        IP. The frontend stores it for the duration of
 *                        the OAuth dance and sends it back on the
 *                        /exchange POST. Single-use — Redis enforces
 *                        once-only redemption.
 *
 *   The ticket binding closes the bearer-replay window even when the
 *   provider's tokens themselves can't be made proof-of-possession (which
 *   is the case for GitHub access_tokens — GitHub doesn't issue OIDC
 *   id_tokens at all). Without a fresh, IP-matched, unconsumed ticket,
 *   any captured token is useless against /exchange.
 *
 * Endpoint is intentionally {@code permitAll} (see {@link
 * io.netscope.config.SecurityConfig}) — the caller is by definition
 * unauthenticated; that's why they're starting a sign-in.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthStartController {

    /**
     * Response payload — flat strings so the frontend doesn't need any
     * structured-JSON gymnastics. {@code expiresInSeconds} mirrors
     * {@link SignInTicketService#TICKET_TTL} so the client can show a
     * friendly "your sign-in session has expired" hint without having
     * to time it out itself.
     */
    public record StartResponse(String ticket, String nonce, long expiresInSeconds) {}

    private final SignInTicketService tickets;

    public AuthStartController(SignInTicketService tickets) {
        this.tickets = tickets;
    }

    @PostMapping("/start")
    public StartResponse start(HttpServletRequest req) {
        // UUID-based nonce — sufficient entropy (122 bits) for OIDC's
        // replay-prevention guarantee, plenty cheap to mint per sign-in.
        // We don't reuse the ticketId as the nonce because rotating the
        // two independently lets us add jti-style replay tracking on
        // the OIDC claim itself later without touching ticket plumbing.
        String nonce = UUID.randomUUID().toString();
        String requesterIp = ClientIpResolver.clientIp(req);
        String ticket = tickets.issue(nonce, requesterIp);
        return new StartResponse(
            ticket, nonce, SignInTicketService.TICKET_TTL.toSeconds());
    }
}
