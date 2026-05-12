package io.netscope;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableAsync
@EnableScheduling
public class NetScopeApplication {
    public static void main(String[] args) {
        // Pin JVM DNS cache TTL so validator + HttpClient (and SSLSocket
        // and Socket) see the same resolved IP within the same request.
        //
        // The fetchers (RedirectController, SafeHttpClient, etc.) resolve
        // the host through TargetValidator and then hand the URI to a
        // HttpClient that does its OWN DNS lookup at connect time. If
        // the platform DNS cache had a sub-second TTL (an attacker could
        // achieve that with a low-TTL authoritative resolver), the
        // second lookup might return a different IP and bypass the
        // SSRF block.
        //
        // 30 s is the OpenJDK default when no SecurityManager is
        // installed, but the documented default in security policy is
        // "forever", so we set it explicitly to remove ambiguity and to
        // survive operator-level java.security tweaks. Negative TTL
        // (failed lookups) stays at 10 s — long enough to avoid stress
        // on misconfigured nameservers, short enough that fixing DNS
        // doesn't require a restart.
        java.security.Security.setProperty("networkaddress.cache.ttl",            "30");
        java.security.Security.setProperty("networkaddress.cache.negative.ttl",   "10");

        SpringApplication.run(NetScopeApplication.class, args);
    }
}
