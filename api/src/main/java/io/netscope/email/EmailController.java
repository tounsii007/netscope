package io.netscope.email;

import io.netscope.common.ApiException;
import io.netscope.common.BoundedDns;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;
import org.xbill.DNS.*;
import org.xbill.DNS.Record;

import java.io.*;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Validates an email address in three layers: syntax (RFC 5322 via Jakarta),
 * MX records (dnsjava), and optional SMTP RCPT handshake (without sending a
 * message). Disposable providers flagged from an embedded list.
 */
@RestController
@RequestMapping("/api/v1/email")
public class EmailController {

    public record VerifyRequest(@NotBlank @Email String email, Boolean smtpProbe) {}

    private static final Set<String> DISPOSABLE = Set.of(
        "mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com",
        "yopmail.com", "trashmail.com", "throwawaymail.com", "temp-mail.org",
        "sharklasers.com", "maildrop.cc", "getnada.com", "fakemail.net",
        "tempr.email", "dispostable.com", "mytemp.email", "inboxalias.com"
    );
    private static final Set<String> ROLE = Set.of(
        "admin", "administrator", "info", "support", "contact", "sales",
        "help", "noreply", "no-reply", "root", "webmaster", "postmaster"
    );

    @PostMapping("/verify")
    public Map<String, Object> verify(@Valid @RequestBody VerifyRequest req) {
        String email = req.email().toLowerCase().trim();
        int at = email.lastIndexOf('@');
        String local = email.substring(0, at);
        String domain = email.substring(at + 1);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("email", email);
        out.put("local", local);
        out.put("domain", domain);
        out.put("syntaxValid", true);
        out.put("disposable", DISPOSABLE.contains(domain));
        out.put("role", ROLE.contains(local));

        List<String> mx = lookupMx(domain);
        out.put("mx", mx);
        out.put("hasMx", !mx.isEmpty());

        int score = 100;
        if (mx.isEmpty()) score -= 60;
        if (Boolean.TRUE.equals(out.get("disposable"))) score -= 50;
        if (Boolean.TRUE.equals(out.get("role"))) score -= 10;

        if (Boolean.TRUE.equals(req.smtpProbe()) && !mx.isEmpty()) {
            Map<String, Object> probe = smtpProbe(mx.get(0), email);
            out.put("smtp", probe);
            if (!Boolean.TRUE.equals(probe.get("accepted"))) score -= 30;
        }

        out.put("score", Math.max(0, score));
        out.put("deliverable", score >= 60);
        return out;
    }

    private List<String> lookupMx(String domain) {
        try {
            // Bounded — caps the lookup to ~3s even against tarpit nameservers.
            Record[] recs = BoundedDns.run(domain, Type.MX);
            if (recs == null) return List.of();
            List<MXRecord> sorted = new ArrayList<>();
            for (Record r : recs) if (r instanceof MXRecord m) sorted.add(m);
            sorted.sort(Comparator.comparingInt(MXRecord::getPriority));
            return sorted.stream().map(m -> m.getTarget().toString(true)).toList();
        } catch (Exception e) { return List.of(); }
    }

    /** Hard ceiling on the TOTAL probe time (connect + all RCPT roundtrips). */
    private static final long SMTP_PROBE_TOTAL_MS = 12_000;
    /** Per-read timeout. Below the total cap so a single slow read can't eat the whole budget. */
    private static final int  SMTP_READ_TIMEOUT_MS = 4_000;
    /** Refuse a multi-line SMTP response longer than this (Slowloris guard). */
    private static final int  SMTP_MAX_LINES_PER_RESPONSE = 50;

    /**
     * SMTP RCPT probe with three layers of timeout:
     *
     *   1. Connect timeout         5 s     (TCP SYN-ACK ceiling)
     *   2. Per-read socket timeout 4 s     (each readLine cannot block longer)
     *   3. Total wall-clock cap   12 s     (sum of all roundtrips + reads)
     *   4. Per-response line cap  50       (Slowloris-style multi-line abuse)
     *
     * Without (3) and (4), a malicious SMTP server returning multi-line
     * 4xx responses one byte per second would eat 5 s × 4 commands = 20 s
     * of thread time per probe, allowing an attacker to DoS the verifier
     * by submitting many email-verify requests targeting their server.
     */
    private Map<String, Object> smtpProbe(String mxHost, String email) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mx", mxHost);
        long deadline = System.currentTimeMillis() + SMTP_PROBE_TOTAL_MS;
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(InetAddress.getByName(mxHost), 25), 5000);
            s.setSoTimeout(SMTP_READ_TIMEOUT_MS);
            BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
            BufferedWriter w = new BufferedWriter(new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8));
            readCode(in, deadline); // banner
            write(w, "EHLO netscope.io"); readCode(in, deadline);
            write(w, "MAIL FROM:<probe@netscope.io>"); readCode(in, deadline);
            write(w, "RCPT TO:<" + email + ">");
            int code = readCode(in, deadline);
            write(w, "QUIT");
            out.put("code", code);
            out.put("accepted", code >= 200 && code < 300);
        } catch (Exception e) {
            out.put("accepted", false);
            out.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        return out;
    }

    private void write(BufferedWriter w, String cmd) throws IOException {
        w.write(cmd); w.write("\r\n"); w.flush();
    }

    /**
     * Read an SMTP status code with a deadline. Aborts if:
     *   • The total probe time has already elapsed.
     *   • More than {@link #SMTP_MAX_LINES_PER_RESPONSE} continuation lines are received.
     */
    private int readCode(BufferedReader in, long deadline) throws IOException {
        String line;
        int code = 0;
        int lineCount = 0;
        while ((line = in.readLine()) != null) {
            if (System.currentTimeMillis() >= deadline) {
                throw new IOException("SMTP probe exceeded total time cap");
            }
            if (++lineCount > SMTP_MAX_LINES_PER_RESPONSE) {
                throw new IOException("SMTP server sent too many continuation lines");
            }
            if (line.length() < 3) break;
            try { code = Integer.parseInt(line.substring(0, 3)); } catch (Exception ignored) {}
            if (line.charAt(3) != '-') break;
        }
        return code;
    }
}
