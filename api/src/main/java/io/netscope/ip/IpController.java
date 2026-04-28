package io.netscope.ip;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import ua_parser.Client;
import ua_parser.Parser;

import java.util.*;

@RestController
@RequestMapping("/api/v1/ip")
public class IpController {

    private final IpService ipService;
    private final IpMultiSourceService multiService;
    private final Parser uaParser = new Parser();

    public IpController(IpService ipService, IpMultiSourceService multiService) {
        this.ipService = ipService;
        this.multiService = multiService;
    }

    @GetMapping("/{ip}")
    public Map<String, Object> lookup(@PathVariable String ip) {
        return ipService.lookup(ip);
    }

    /**
     * Aggregated multi-source view — queries every configured geolocation
     * provider in parallel and returns each provider's verbatim answer plus
     * a combined "best-of" view. Useful when the user wants to compare
     * accuracy across providers (which often differ noticeably).
     */
    @GetMapping("/{ip}/sources")
    public Map<String, Object> sources(@PathVariable String ip) {
        return multiService.lookup(ip);
    }

    @GetMapping("/me")
    public Map<String, Object> me(HttpServletRequest req) {
        String ip = clientIp(req);
        Map<String, Object> base = ipService.lookup(ip);
        String ua = req.getHeader("User-Agent");
        Map<String, Object> client = new LinkedHashMap<>();
        if (ua != null) {
            Client c = uaParser.parse(ua);
            client.put("browser", c.userAgent.family + " " + c.userAgent.major);
            client.put("os", c.os.family + " " + (c.os.major == null ? "" : c.os.major));
            client.put("device", c.device.family);
        }
        client.put("userAgent", ua);
        client.put("acceptLanguage", req.getHeader("Accept-Language"));

        Map<String, Object> out = new LinkedHashMap<>(base);
        out.put("client", client);
        return out;
    }

    private String clientIp(HttpServletRequest req) {
        String fwd = req.getHeader("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) return fwd.split(",")[0].trim();
        return req.getRemoteAddr();
    }
}
