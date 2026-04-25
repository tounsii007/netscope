package io.netscope.monitor;

import io.netscope.auth.ApiKeyContext;
import io.netscope.common.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/monitor")
public class MonitorController {

    public record MonitorRequest(
        @NotBlank String name,
        @Pattern(regexp = "http|tcp|ping") String type,
        @NotBlank String target,
        @Min(1) @Max(65535) Integer port,
        @Min(60) @Max(86400) Integer intervalSec,
        @Email String alertEmail
    ) {}

    private final MonitorRepository monitors;
    private final MonitorCheckRepository checks;

    public MonitorController(MonitorRepository m, MonitorCheckRepository c) {
        this.monitors = m; this.checks = c;
    }

    @PostMapping
    public Monitor create(@Valid @RequestBody MonitorRequest req) {
        UUID owner = ApiKeyContext.get().getId();
        Monitor m = new Monitor();
        m.setApiKeyId(owner);
        m.setName(req.name());
        m.setType(req.type());
        m.setTarget(req.target());
        m.setPort(req.port());
        m.setIntervalSec(req.intervalSec() == null ? 300 : req.intervalSec());
        return monitors.save(m);
    }

    @GetMapping
    public List<Monitor> list() {
        return monitors.findByApiKeyId(ApiKeyContext.get().getId());
    }

    @GetMapping("/{id}/history")
    public Page<MonitorCheck> history(@PathVariable UUID id,
                                      @RequestParam(defaultValue = "24") int hours,
                                      @RequestParam(defaultValue = "0") @Min(0) int page,
                                      @RequestParam(defaultValue = "100") @Min(1) @Max(1000) int size) {
        // Atomic owner check — no timing gap to distinguish 403 from 404.
        // findByIdAndApiKeyId returns empty for both "not yours" and "not exists",
        // and the response collapses to 404 in both cases.
        monitors.findByIdAndApiKeyId(id, ApiKeyContext.get().getId())
            .orElseThrow(() -> ApiException.notFound("monitor not found"));
        PageRequest pr = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "checkedAt"));
        return checks.history(id, Instant.now().minus(Duration.ofHours(hours)), pr);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable UUID id) {
        // Atomic owner check — see history() for rationale.
        Monitor m = monitors.findByIdAndApiKeyId(id, ApiKeyContext.get().getId())
            .orElseThrow(() -> ApiException.notFound("monitor not found"));
        monitors.delete(m);
    }
}
