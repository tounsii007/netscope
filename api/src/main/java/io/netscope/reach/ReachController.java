package io.netscope.reach;

import io.netscope.common.SafeHttpClient;
import io.netscope.common.TargetValidator;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/reach")
public class ReachController {

    public record ReachRequest(@NotBlank String target, Integer port, String method) {}

    private final TargetValidator validator;
    private final SafeHttpClient http;

    public ReachController(TargetValidator v, SafeHttpClient http) {
        this.validator = v; this.http = http;
    }

    @PostMapping("/check")
    public Map<String, Object> check(@RequestBody ReachRequest req) {
        InetAddress addr = validator.resolveAndValidate(req.target());
        String method = req.method() == null ? "auto" : req.method();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("target", req.target());
        out.put("resolvedIp", addr.getHostAddress());

        if ("auto".equals(method) || "http".equals(method)) {
            out.put("http", httpCheck(req.target()));
        }
        if ("auto".equals(method) || "tcp".equals(method)) {
            out.put("tcp", tcpCheck(addr, req.port() == null ? 443 : req.port()));
        }
        if ("auto".equals(method) || "ping".equals(method)) {
            out.put("ping", pingCheck(addr));
        }
        return out;
    }

    private Map<String, Object> httpCheck(String target) {
        String url = target.startsWith("http") ? target : "https://" + target;
        long start = System.currentTimeMillis();
        try {
            HttpResponse<Void> res = http.send(
                HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(8)).HEAD().build(),
                HttpResponse.BodyHandlers.discarding());
            return Map.of("ok", true, "status", res.statusCode(),
                "latencyMs", System.currentTimeMillis() - start);
        } catch (Exception e) {
            return Map.of("ok", false, "error", e.getClass().getSimpleName());
        }
    }

    private Map<String, Object> tcpCheck(InetAddress addr, int port) {
        long start = System.currentTimeMillis();
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(addr, port), 3000);
            return Map.of("ok", true, "port", port, "latencyMs", System.currentTimeMillis() - start);
        } catch (Exception e) {
            return Map.of("ok", false, "port", port, "error", e.getClass().getSimpleName());
        }
    }

    private Map<String, Object> pingCheck(InetAddress addr) {
        long start = System.currentTimeMillis();
        try {
            boolean reachable = addr.isReachable(3000);
            return Map.of("ok", reachable, "latencyMs", System.currentTimeMillis() - start);
        } catch (Exception e) {
            return Map.of("ok", false, "error", e.getClass().getSimpleName());
        }
    }
}
