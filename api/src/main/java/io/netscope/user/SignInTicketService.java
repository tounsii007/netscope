package io.netscope.user;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;

/**
 * One-shot HMAC-signed sign-in tickets for the F-RD3-03 fix.
 *
 * Background — bearer-token replay closure:
 *   /api/v1/auth/exchange used to accept any provider-issued access_token /
 *   id_token directly. A token captured from any source (malicious browser
 *   extension, referer leak, SDK log, breach dump) could be POSTed straight
 *   to /exchange and would mint a netscope JWT for the original subject.
 *   There was no binding to a sign-in *request* the backend had agreed to.
 *
 *   This service closes the gap. The flow becomes:
 *
 *     1. Frontend hits POST /api/v1/auth/start
 *        — backend mints a fresh {@code nonce} (forwarded to the OIDC
 *        provider) and a one-shot {@code ticket} (HMAC over ticketId +
 *        expiry + nonce + requester IP).
 *     2. Frontend completes the OAuth dance with the provider, using the
 *        backend-supplied {@code nonce} as the OIDC nonce parameter.
 *     3. Frontend posts to /api/v1/auth/exchange with the ticket alongside
 *        access_token / id_token. Backend re-HMACs the ticket, checks
 *        expiry + IP binding + redis-marked one-shot consumption, and ONLY
 *        THEN proceeds to OAuth verification.
 *
 *   A captured access_token without a matching, unconsumed, IP-bound ticket
 *   is now useless against /exchange. The ticket is bound to the IP that
 *   started the sign-in, so a token leaked from one IP can't even be paired
 *   with a fresh ticket minted from a different IP.
 *
 * Ticket format (compact, single base64url string):
 *
 *     base64url( ticketId.bytes ‖ expEpochSecond ‖ nonceLen.byte ‖
 *                nonce.bytes   ‖ ipLen.byte      ‖ ip.bytes      ‖
 *                hmac32 )
 *
 *   Single self-contained string means the controller never has to store
 *   anything to issue a ticket — the only stateful step is the Redis
 *   "consumed" marker, written on first successful verify. That marker
 *   is what enforces the one-shot semantics; the HMAC alone proves
 *   authenticity but a token already redeemed needs Redis to know.
 *
 *   The HMAC uses the same {@code netscope.jwt.secret} the rest of the
 *   identity surface depends on, unless a separate
 *   {@code netscope.oauth.ticket-secret} is provided. We deliberately do
 *   NOT silently fall back to a static dev secret outside dev/test —
 *   {@link #init()} mirrors {@link JwtService#init()}'s startup guard.
 *
 * Cleanup: tickets are short-lived (5 min). The Redis "consumed" marker
 *   carries a 30-min TTL — comfortably longer than the ticket lifetime so
 *   we can detect replay of a token that hasn't expired yet, but bounded
 *   so the bookkeeping doesn't grow without limit.
 */
@Service
public class SignInTicketService {

    private static final Logger log = LoggerFactory.getLogger(SignInTicketService.class);

    /** Ticket validity window from issue. Long enough for the slowest
     *  legitimate OAuth round-trip on a mobile network (5 min is the
     *  upper bound NextAuth's own callback timer also assumes), short
     *  enough that a leaked ticket can't sit around. */
    static final Duration TICKET_TTL = Duration.ofMinutes(5);

    /** "Consumed" marker TTL in Redis. Set generously to outlive the
     *  ticket TTL by enough margin that an attacker can't replay a
     *  recently-redeemed ticket by waiting for the marker to expire
     *  before the ticket does. */
    static final Duration CONSUMED_TTL = Duration.ofMinutes(30);

    /** Redis namespace for the one-shot consumption marker. */
    private static final String CONSUMED_NS = "auth:signin:consumed:";

    /** HMAC algorithm — same family JwtService uses for HS256. */
    private static final String MAC_ALG = "HmacSHA256";

    /** Optional override; if blank we fall back to the JWT secret. */
    @Value("${netscope.oauth.ticket-secret:}")
    private String ticketSecret;

    @Value("${netscope.jwt.secret}")
    private String jwtSecret;

    private final StringRedisTemplate redis;
    private final Environment env;
    private byte[] keyBytes;

    public SignInTicketService(StringRedisTemplate redis, Environment env) {
        this.redis = redis;
        this.env = env;
    }

    @PostConstruct
    void init() {
        String chosen = (ticketSecret != null && !ticketSecret.isBlank())
            ? ticketSecret : jwtSecret;
        if (chosen == null || chosen.length() < 32) {
            throw new IllegalStateException(
                "SignInTicketService requires a 32+ char secret. Set "
                + "NETSCOPE_OAUTH_TICKET_SECRET or fall back to JWT_SECRET "
                + "(both must be at least 32 characters).");
        }
        if (JwtService.KNOWN_WEAK_SECRETS.contains(chosen) && !isDevOrTestProfile()) {
            throw new IllegalStateException(
                "SignInTicketService secret is a known placeholder. Set "
                + "NETSCOPE_OAUTH_TICKET_SECRET (or JWT_SECRET) to a strong "
                + "random secret outside dev/test profiles.");
        }
        this.keyBytes = chosen.getBytes(StandardCharsets.UTF_8);
        log.info("SignInTicketService initialised (using {} secret)",
            (ticketSecret != null && !ticketSecret.isBlank()) ? "dedicated ticket" : "JWT");
    }

    private boolean isDevOrTestProfile() {
        for (String p : env.getActiveProfiles()) {
            if ("dev".equalsIgnoreCase(p) || "test".equalsIgnoreCase(p)) return true;
        }
        return false;
    }

    /**
     * Issue a one-shot ticket bound to a freshly-minted nonce and the
     * requester's IP. Pure function modulo system clock — the ticket
     * itself is the only side-effectful artefact, and we don't touch
     * Redis on the issue path (we don't want a hot Redis dep on the
     * sign-in-start hot path; the only Redis touch is at redeem time).
     */
    public String issue(String nonce, String requesterIp) {
        if (nonce == null || nonce.isBlank()) {
            throw new IllegalArgumentException("nonce must not be blank");
        }
        UUID ticketId = UUID.randomUUID();
        long expEpoch = System.currentTimeMillis() / 1000L + TICKET_TTL.toSeconds();
        String safeIp = requesterIp == null ? "" : requesterIp;
        byte[] nonceBytes = nonce.getBytes(StandardCharsets.UTF_8);
        byte[] ipBytes = safeIp.getBytes(StandardCharsets.UTF_8);
        if (nonceBytes.length > 255 || ipBytes.length > 255) {
            throw new IllegalArgumentException("nonce/ip too long");
        }
        byte[] payload = pack(ticketId, expEpoch, nonceBytes, ipBytes);
        byte[] mac = hmac(payload);
        byte[] all = new byte[payload.length + mac.length];
        System.arraycopy(payload, 0, all, 0, payload.length);
        System.arraycopy(mac, 0, all, payload.length, mac.length);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(all);
    }

    /**
     * Result of a successful redeem — the original nonce, surfaced so
     * the caller can pass it through to OidcIdTokenVerifier as the
     * expected nonce (F-RD3-04). Carrying the ticket id is purely for
     * diagnostics / metrics; nothing security-relevant.
     */
    public record Redeemed(UUID ticketId, String nonce) {}

    /**
     * Verify, IP-bind, and atomically mark a ticket consumed. Throws
     * {@link IllegalArgumentException} on:
     *   • bad shape / base64
     *   • tampered HMAC
     *   • expired
     *   • IP mismatch (token was issued for a different client IP)
     *   • already-consumed (replay)
     *
     * Atomicity: Redis SETNX on the consumed-marker key guarantees only
     * one caller wins the redeem race. If two requests arrive with the
     * same ticket in flight, exactly one gets back a {@link Redeemed}
     * and the other gets the replay error.
     */
    public Redeemed verifyAndConsume(String ticket, String requesterIp) {
        if (ticket == null || ticket.isBlank()) {
            throw new IllegalArgumentException("ticket required");
        }
        byte[] raw;
        try {
            raw = Base64.getUrlDecoder().decode(ticket);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("ticket malformed");
        }
        if (raw.length < 16 + 8 + 1 + 0 + 1 + 0 + 32) {
            throw new IllegalArgumentException("ticket malformed");
        }
        // Split payload | mac (mac is the trailing 32 bytes).
        int macStart = raw.length - 32;
        byte[] payload = new byte[macStart];
        byte[] mac = new byte[32];
        System.arraycopy(raw, 0, payload, 0, macStart);
        System.arraycopy(raw, macStart, mac, 0, 32);

        // Re-HMAC and constant-time-compare. Anything off here means a
        // tampered or forged ticket — bail before reading payload fields
        // so we don't leak structural info via differing error timing.
        byte[] expected = hmac(payload);
        if (!MessageDigest.isEqual(expected, mac)) {
            throw new IllegalArgumentException("ticket signature invalid");
        }

        // Now parse the verified payload.
        Unpacked u;
        try {
            u = unpack(payload);
        } catch (Exception e) {
            throw new IllegalArgumentException("ticket malformed");
        }

        long now = System.currentTimeMillis() / 1000L;
        if (u.expEpoch < now) {
            throw new IllegalArgumentException("ticket expired");
        }

        String safeIp = requesterIp == null ? "" : requesterIp;
        // Constant-time IP comparison so we don't trivially leak which
        // bound IP a captured ticket carries via timing.
        if (!MessageDigest.isEqual(
                u.ip.getBytes(StandardCharsets.UTF_8),
                safeIp.getBytes(StandardCharsets.UTF_8))) {
            throw new IllegalArgumentException("ticket bound to a different client");
        }

        // One-shot enforcement. SETNX returns true only when the key was
        // freshly created — any second redeem of the same ticket within
        // CONSUMED_TTL trips this branch.
        Boolean fresh = redis.opsForValue()
            .setIfAbsent(CONSUMED_NS + u.ticketId, "1", CONSUMED_TTL);
        if (!Boolean.TRUE.equals(fresh)) {
            throw new IllegalArgumentException("ticket already consumed");
        }
        return new Redeemed(u.ticketId, u.nonce);
    }

    /* ─── Internal helpers ─── */

    private byte[] hmac(byte[] payload) {
        try {
            Mac m = Mac.getInstance(MAC_ALG);
            m.init(new SecretKeySpec(keyBytes, MAC_ALG));
            return m.doFinal(payload);
        } catch (Exception e) {
            // HMAC failure here is a JRE-level misconfiguration — turn
            // it into a runtime so the sign-in surface fails loudly
            // rather than minting an unsigned ticket.
            throw new IllegalStateException("HMAC failure", e);
        }
    }

    private static byte[] pack(UUID id, long expEpoch, byte[] nonce, byte[] ip) {
        // 16 (UUID) + 8 (exp) + 1 + nonce.length + 1 + ip.length
        byte[] out = new byte[16 + 8 + 1 + nonce.length + 1 + ip.length];
        int o = 0;
        long hi = id.getMostSignificantBits();
        long lo = id.getLeastSignificantBits();
        for (int i = 7; i >= 0; i--) out[o++] = (byte) ((hi >>> (i * 8)) & 0xFF);
        for (int i = 7; i >= 0; i--) out[o++] = (byte) ((lo >>> (i * 8)) & 0xFF);
        for (int i = 7; i >= 0; i--) out[o++] = (byte) ((expEpoch >>> (i * 8)) & 0xFF);
        out[o++] = (byte) nonce.length;
        System.arraycopy(nonce, 0, out, o, nonce.length); o += nonce.length;
        out[o++] = (byte) ip.length;
        System.arraycopy(ip, 0, out, o, ip.length);
        return out;
    }

    private record Unpacked(UUID ticketId, long expEpoch, String nonce, String ip) {}

    private static Unpacked unpack(byte[] payload) {
        int o = 0;
        long hi = 0L;
        long lo = 0L;
        for (int i = 0; i < 8; i++) hi = (hi << 8) | (payload[o++] & 0xFFL);
        for (int i = 0; i < 8; i++) lo = (lo << 8) | (payload[o++] & 0xFFL);
        UUID id = new UUID(hi, lo);
        long exp = 0L;
        for (int i = 0; i < 8; i++) exp = (exp << 8) | (payload[o++] & 0xFFL);
        int nonceLen = payload[o++] & 0xFF;
        String nonce = new String(payload, o, nonceLen, StandardCharsets.UTF_8);
        o += nonceLen;
        int ipLen = payload[o++] & 0xFF;
        String ip = new String(payload, o, ipLen, StandardCharsets.UTF_8);
        return new Unpacked(id, exp, nonce, ip);
    }
}
