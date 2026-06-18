package io.netscope.dkim;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Quality-rules engine for a parsed DKIM record. Returns a list of
 * end-user-facing warnings: weak keys, deprecated SHA-1-only declarations,
 * test-mode flags, revoked or unparseable keys.
 *
 * Lives separately from {@link DkimRecordParser} so the rule set can grow
 * (new heuristics about ED25519 adoption, key-rotation cadence, …)
 * without making the parser itself heavier.
 */
public final class DkimWarningCheck {
    private DkimWarningCheck() {}

    public static List<String> evaluate(
            Map<String, String> tags,
            DkimKeyDecoder.PubKeyInfo keyInfo,
            List<String> hashAlgs,
            boolean revoked) {

        List<String> warnings = new ArrayList<>();
        if (revoked) {
            warnings.add("Key is revoked (empty p= tag) — common during key rotation");
        } else if (tags.get("p") == null) {
            warnings.add("Missing p= tag — DKIM record is malformed");
        } else if (keyInfo != null && "RSA".equalsIgnoreCase(keyInfo.algorithm())) {
            if (keyInfo.bits() < 1024) {
                warnings.add("RSA key is " + keyInfo.bits()
                    + " bits — below 1024 fails verification at most providers");
            } else if (keyInfo.bits() < 2048) {
                warnings.add("RSA key is " + keyInfo.bits()
                    + " bits — 2048 is the modern minimum");
            }
        }
        // RFC 8301 deprecates SHA-1-only DKIM. Modern verifiers may drop
        // signatures that only declare sha1; surface to operators.
        if (hashAlgs.size() == 1 && "sha1".equals(hashAlgs.get(0))) {
            warnings.add("Only SHA-1 declared (h=sha1) — RFC 8301 deprecates SHA-1 for DKIM; advertise SHA-256");
        }
        if ("y".equals(tags.get("t"))) {
            warnings.add("Test mode flag set (t=y) — verifiers may ignore failures; remove before production");
        }
        return warnings;
    }
}
