package io.netscope.port;

import io.netscope.scan.ScanAudit;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/port")
public class PortController {

    private final PortService service;
    public PortController(PortService service) { this.service = service; }

    @PostMapping("/check")
    @ScanAudit(tool = "port.check")
    public PortDtos.PortCheckResult check(@Valid @RequestBody PortDtos.PortCheckRequest req) {
        int timeout = req.timeoutMs() == null ? 2500 : req.timeoutMs();
        String proto = req.protocol() == null ? "tcp" : req.protocol();
        return service.check(req.target(), req.port(), proto, timeout);
    }

    @PostMapping("/scan")
    @ScanAudit(tool = "port.scan")
    public PortDtos.PortScanResult scan(@Valid @RequestBody PortDtos.PortScanRequest req) {
        return service.scan(req);
    }
}
