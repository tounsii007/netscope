package io.netscope.monitor;

import io.netscope.auth.ApiKeyContext;
import io.netscope.common.ApiException;
import io.netscope.common.TargetValidator;
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
        @NotBlank @Size(max = 128) String name,
        @Pattern(regexp = "http|tcp|ping") String type,
        // Hostnames + URLs both fit easily in 253 chars (RFC 1035 limit).
        // Without a cap the user could fill the row with megabyte strings
        // and the scheduler would still tick them on every interval.
        @NotBlank @Size(max = 253) String target,
        @Min(1) @Max(65535) Integer port,
        @Min(60) @Max(86400) Integer intervalSec,
        @Email @Size(max = 320) String alertEmail
    ) {}

    private final MonitorRepository monitors;
    private final MonitorCheckRepository checks;
    private final TargetValidator validator;

    public MonitorController(MonitorRepository m, MonitorCheckRepository c, TargetValidator v) {
        this.monitors = m; this.checks = c; this.validator = v;
    }

    @PostMapping
    public Monitor create(@Valid @RequestBody MonitorRequest req) {
        // Fail-fast: reject targets that resolve to internal/private
        // address space at create time, not just at check time. Without
        // this gate, an OWNER could fill the monitors table with bogus
        // entries that the scheduler then sweeps every interval — UX
        // is bad (user thinks they configured a real monitor) AND it's
        // a small SSRF-recon primitive (the scheduler will keep trying
        // internal IPs and surface their reachability in the dashboard).
        // For "http" type we strip a leading scheme to validate the host.
        String hostOnly = req.target();
        int scheme = hostOnly.indexOf("://");
        if (scheme >= 0) hostOnly = hostOnly.substring(scheme + 3);
        int slash = hostOnly.indexOf('/');
        if (slash >= 0) hostOnly = hostOnly.substring(0, slash);
        int colon = hostOnly.indexOf(':');
        if (colon >= 0) hostOnly = hostOnly.substring(0, colon);
        try {
            validator.resolveAndValidate(hostOnly);
        } catch (ApiException e) {
            // Re-throw with a single end-user message rather than echoing
            // the validator's "address is reserved or internal" / "could
            // not resolve" distinction. The caller is authenticated so
            // strong opacity isn't critical, but a single message keeps
            // the create-flow error UI consistent and avoids inadvertent
            // leaks if the validator's wording is tuned later.
            throw ApiException.badRequest(
                "target rejected: must be a publicly resolvable hostname or IP");
        }

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
                                      // 720 h = 30 days; the UI never shows
                                      // more than that. Without a cap an
                                      // authenticated user can pass an
                                      // arbitrary value and force a full
                                      // table scan of monitor_check.
                                      @RequestParam(defaultValue = "24") @Min(1) @Max(720) int hours,
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
