package io.netscope.common.security;
import io.netscope.common.errors.ApiException;

import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.UnknownHostException;

/**
 * Blocks scans against private/loopback/cloud-metadata ranges to prevent SSRF
 * and internal reconnaissance. Resolves hostnames and validates the result.
 *
 * <p>Thin orchestrator — delegates to:
 * <ul>
 *   <li>{@link HostnameNormaliser} — IDN canonicalisation + syntax validation
 *   <li>{@link BlockedAddressRules} — RFC-reserved + cloud-metadata block list
 * </ul>
 * Both helpers are package-private; reach them through this bean.
 */
@Component
public class TargetValidator {

    public InetAddress resolveAndValidate(String target) {
        if (target == null || target.isBlank()) {
            throw ApiException.badRequest("target is required");
        }
        String canonical = HostnameNormaliser.canonicalise(target.trim().toLowerCase());
        try {
            // SSRF hardening: a hostname can have multiple A/AAAA records
            // and getByName() returns only the first. A split-horizon DNS
            // ("first A → 8.8.8.8, second A → 127.0.0.1") could leak
            // through if we only checked the first. Iterate ALL resolved
            // addresses; reject the request if any one is blocked.
            InetAddress[] all = InetAddress.getAllByName(canonical);
            for (InetAddress a : all) {
                if (isBlocked(a)) {
                    throw ApiException.forbidden("target is a reserved or internal address");
                }
            }
            return all[0];
        } catch (UnknownHostException e) {
            throw ApiException.badRequest("could not resolve: " + canonical);
        }
    }

    public boolean isBlocked(InetAddress addr) {
        return BlockedAddressRules.isBlocked(addr);
    }
}
