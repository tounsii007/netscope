package io.netscope.port;

import io.netscope.common.errors.ApiException;
import io.netscope.common.security.TargetValidator;
import org.springframework.stereotype.Service;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.*;
import java.util.concurrent.*;

@Service
public class PortService {

    private static final Map<Integer, String> WELL_KNOWN = Map.ofEntries(
        Map.entry(21, "ftp"), Map.entry(22, "ssh"), Map.entry(23, "telnet"),
        Map.entry(25, "smtp"), Map.entry(53, "dns"), Map.entry(80, "http"),
        Map.entry(110, "pop3"), Map.entry(143, "imap"), Map.entry(443, "https"),
        Map.entry(465, "smtps"), Map.entry(587, "submission"), Map.entry(993, "imaps"),
        Map.entry(995, "pop3s"), Map.entry(3306, "mysql"), Map.entry(3389, "rdp"),
        Map.entry(5432, "postgres"), Map.entry(6379, "redis"), Map.entry(8080, "http-alt"),
        Map.entry(8443, "https-alt"), Map.entry(27017, "mongodb")
    );

    static final int[] COMMON_PORTS = {
        21, 22, 23, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995,
        3306, 3389, 5432, 6379, 8080, 8443, 27017
    };

    private final TargetValidator validator;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public PortService(TargetValidator validator) { this.validator = validator; }

    public PortDtos.PortCheckResult check(String target, int port, String protocol, int timeoutMs) {
        InetAddress addr = validator.resolveAndValidate(target);
        String proto = protocol == null ? "tcp" : protocol;
        long start = System.currentTimeMillis();
        try (Socket socket = new Socket()) {
            // Connect using the resolved, validated address object (not hostname) so the
            // OS does not re-resolve via DNS and bypass our SSRF check (DNS rebinding).
            socket.connect(new InetSocketAddress(addr.getHostAddress(), port), timeoutMs);
            int latency = (int) (System.currentTimeMillis() - start);
            return new PortDtos.PortCheckResult(target, addr.getHostAddress(), port, proto,
                true, latency, WELL_KNOWN.get(port), null);
        } catch (java.net.SocketTimeoutException e) {
            return new PortDtos.PortCheckResult(target, addr.getHostAddress(), port, proto,
                false, null, WELL_KNOWN.get(port), "timeout");
        } catch (Exception e) {
            return new PortDtos.PortCheckResult(target, addr.getHostAddress(), port, proto,
                false, null, WELL_KNOWN.get(port), e.getClass().getSimpleName());
        }
    }

    public PortDtos.PortScanResult scan(PortDtos.PortScanRequest req) {
        List<Integer> ports = resolvePorts(req);
        InetAddress addr = validator.resolveAndValidate(req.target());
        long start = System.currentTimeMillis();

        List<Future<PortDtos.PortCheckResult>> futures = new ArrayList<>();
        for (int port : ports) {
            int p = port;
            futures.add(executor.submit(() -> check(req.target(), p, "tcp", 1500)));
        }

        List<PortDtos.PortCheckResult> results = new ArrayList<>();
        for (Future<PortDtos.PortCheckResult> f : futures) {
            try { results.add(f.get(20, TimeUnit.SECONDS)); }
            catch (Exception ignored) {}
        }
        int open = (int) results.stream().filter(PortDtos.PortCheckResult::open).count();
        return new PortDtos.PortScanResult(req.target(), addr.getHostAddress(),
            results.size(), open, System.currentTimeMillis() - start, results);
    }

    /** Max ports a single scan request may target. Bounded so a caller
     *  can't fire 65 535 socket connects in one HTTP request. */
    static final int MAX_PORTS_PER_SCAN = 1024;

    private List<Integer> resolvePorts(PortDtos.PortScanRequest req) {
        if (Boolean.TRUE.equals(req.commonOnly())) {
            return Arrays.stream(COMMON_PORTS).boxed().toList();
        }
        if (req.ports() != null && !req.ports().isEmpty()) {
            // Validate every element: reject nulls (would NPE inside the
            // executor task), reject out-of-range values (would just
            // throw IAE per task and waste threads), and dedupe so
            // duplicates don't inflate the budget or double-bill the
            // scan cap. TreeSet keeps the natural numeric order for
            // a stable, predictable result list.
            TreeSet<Integer> seen = new TreeSet<>();
            for (Integer p : req.ports()) {
                if (p == null) {
                    throw ApiException.badRequest("ports list contains null");
                }
                if (p < 1 || p > 65535) {
                    throw ApiException.badRequest("port " + p + " is out of 1..65535 range");
                }
                seen.add(p);
            }
            if (seen.size() > MAX_PORTS_PER_SCAN) {
                throw ApiException.badRequest("max " + MAX_PORTS_PER_SCAN + " ports per scan");
            }
            return new ArrayList<>(seen);
        }
        if (req.fromPort() != null && req.toPort() != null) {
            if (req.fromPort() < 1 || req.toPort() > 65535 || req.fromPort() > req.toPort()) {
                throw ApiException.badRequest("invalid port range");
            }
            int size = req.toPort() - req.fromPort() + 1;
            if (size > MAX_PORTS_PER_SCAN) {
                throw ApiException.badRequest("max " + MAX_PORTS_PER_SCAN + " ports per scan");
            }
            List<Integer> out = new ArrayList<>(size);
            for (int p = req.fromPort(); p <= req.toPort(); p++) out.add(p);
            return out;
        }
        throw ApiException.badRequest("specify ports, range, or commonOnly");
    }
}
