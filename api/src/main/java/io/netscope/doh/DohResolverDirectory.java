package io.netscope.doh;

import java.net.URI;
import java.util.List;
import java.util.Objects;

/**
 * Catalogue of the public encrypted-DNS providers we probe. Each entry
 * pairs a DoH URL (HTTPS-based, RFC 8484) with its corresponding DoT
 * IP address (TCP/853, RFC 7858) so a single test can verify both
 * transports for the same provider.
 *
 * Lives separately so a future provider addition is a one-line list
 * change instead of a controller diff.
 */
public final class DohResolverDirectory {
    private DohResolverDirectory() {}

    /** Bundles a provider's DoH URL with its corresponding DoT IP. */
    public record ResolverSpec(String name, String dohUrl, String dotHost) {
        public ResolverSpec {
            Objects.requireNonNull(name);
            Objects.requireNonNull(dohUrl);
            URI.create(dohUrl); // fail-fast if a malformed URL ever lands in the list
        }
    }

    /** Current set of public providers. Order is significant only for
     *  test readability — the prober dispatches them in parallel. */
    public static final List<ResolverSpec> ALL = List.of(
        new ResolverSpec("cloudflare", "https://cloudflare-dns.com/dns-query",   "1.1.1.1"),
        new ResolverSpec("google",     "https://dns.google/dns-query",           "8.8.8.8"),
        new ResolverSpec("quad9",      "https://dns.quad9.net/dns-query",        "9.9.9.9"),
        new ResolverSpec("adguard",    "https://dns.adguard-dns.com/dns-query",  "94.140.14.14"),
        new ResolverSpec("nextdns",    "https://dns.nextdns.io",                 "45.90.28.165")
    );
}
