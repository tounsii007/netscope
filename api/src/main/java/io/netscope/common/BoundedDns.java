package io.netscope.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.xbill.DNS.Lookup;
import org.xbill.DNS.Record;
import org.xbill.DNS.Resolver;
import org.xbill.DNS.SimpleResolver;

import java.time.Duration;
import java.util.concurrent.*;

/**
 * Hang-resistant wrapper around dnsjava's {@link Lookup}.
 *
 * Why this class exists:
 *   • {@link Lookup#run()} blocks the calling thread until the resolver
 *     replies. With a malicious or non-responsive nameserver this can
 *     wait indefinitely — exhausting Tomcat / virtual-thread workers.
 *   • dnsjava's default {@link SimpleResolver} timeout is 10 seconds.
 *     For a public-facing tool that's too long; we cap at 3 s per query.
 *   • A {@link CompletableFuture} barrier with {@link #orTimeout(long, TimeUnit)}
 *     guarantees we return within the bound even if dnsjava's own
 *     timeout misfires (e.g. resolver builds a TCP connection to a
 *     tarpit and never times out).
 *
 * Use everywhere we'd otherwise call {@code new Lookup(name, type).run()}.
 */
public final class BoundedDns {

    private static final Logger log = LoggerFactory.getLogger(BoundedDns.class);

    /** Default per-query timeout. Aggressive on purpose — we surface partial results to the user. */
    public static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(3);

    /** Hard ceiling — no caller may ask for more than this. Keeps a buggy callsite from holding a thread for minutes. */
    public static final Duration MAX_TIMEOUT = Duration.ofSeconds(8);

    private static final ExecutorService EXECUTOR =
        Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("bdns-", 0).factory());

    private BoundedDns() {}

    /** Run a DNS lookup with the default timeout. Returns null on timeout / error. */
    public static Record[] run(String name, int type) {
        return run(name, type, DEFAULT_TIMEOUT);
    }

    /** Run a DNS lookup with a custom timeout (capped at {@link #MAX_TIMEOUT}). */
    public static Record[] run(String name, int type, Duration timeout) {
        return runInternal(name, type, timeout, null);
    }

    /**
     * Run a DNS lookup against an explicit resolver (e.g. for DNSSEC
     * queries that need EDNS DO flag set, or PropagationController
     * fanning out to several public resolvers). The caller's resolver
     * is used as-is; we still wrap the call in a {@link CompletableFuture}
     * barrier with {@link #DEFAULT_TIMEOUT} so a tarpit can't pin a
     * thread.
     */
    public static Record[] run(String name, int type, Resolver resolver) {
        return runInternal(name, type, DEFAULT_TIMEOUT, resolver);
    }

    private static Record[] runInternal(String name, int type, Duration timeout, Resolver caller) {
        Duration effective = timeout.compareTo(MAX_TIMEOUT) > 0 ? MAX_TIMEOUT : timeout;
        long timeoutMs = effective.toMillis();

        CompletableFuture<Record[]> f = CompletableFuture.supplyAsync(() -> {
            try {
                Lookup lookup = new Lookup(name, type);
                Resolver resolver = caller;
                if (resolver == null) {
                    // Build a default resolver with the same per-query timeout. Belt + braces.
                    resolver = new SimpleResolver();
                    resolver.setTimeout(effective);
                } else {
                    // Respect the caller's resolver but ensure its per-query
                    // timeout is no looser than ours — otherwise a slow
                    // resolver inside a fast outer cap would still race
                    // against orTimeout and waste the thread.
                    resolver.setTimeout(effective);
                }
                lookup.setResolver(resolver);
                // Bypass dnsjava's process-wide Lookup.defaultCache. For
                // single-shot lookups it's neutral; for the cross-resolver
                // probes (DoH/DoT tester), the default cache returned the
                // FIRST resolver's answer for every subsequent resolver
                // call with the same name+type — defeating the whole
                // "compare answers across providers" point.
                //
                // setCache(null) is dnsjava's documented "do not cache at
                // all" mode and allocates nothing per call. The earlier
                // `new Cache(DClass.IN)` approach worked but added
                // unnecessary heap churn under high DNS load.
                lookup.setCache(null);
                return lookup.run();
            } catch (Exception e) {
                log.debug("DNS lookup failed for {}/{}: {}", name, type, e.getMessage());
                return null;
            }
        }, EXECUTOR);

        try {
            return f.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException te) {
            f.cancel(true);
            log.debug("DNS lookup for {}/{} timed out after {}ms", name, type, timeoutMs);
            return null;
        } catch (Exception e) {
            log.debug("DNS lookup for {}/{} errored: {}", name, type, e.getMessage());
            return null;
        }
    }
}
