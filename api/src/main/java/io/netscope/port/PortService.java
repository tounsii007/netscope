package io.netscope.port;

import io.netscope.common.ApiException;
import io.netscope.common.TargetValidator;
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
        if (ports.size() > 1024) {
            throw ApiException.badRequest("max 1024 ports per scan");
        }
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

    private List<Integer> resolvePorts(PortDtos.PortScanRequest req) {
        if (Boolean.TRUE.equals(req.commonOnly())) {
            return Arrays.stream(COMMON_PORTS).boxed().toList();
        }
        if (req.ports() != null && !req.ports().isEmpty()) {
            return req.ports();
        }
        if (req.fromPort() != null && req.toPort() != null) {
            if (req.fromPort() < 1 || req.toPort() > 65535 || req.fromPort() > req.toPort()) {
                throw ApiException.badRequest("invalid port range");
            }
            List<Integer> out = new ArrayList<>();
            for (int p = req.fromPort(); p <= req.toPort(); p++) out.add(p);
            return out;
        }
        throw ApiException.badRequest("specify ports, range, or commonOnly");
    }
}
