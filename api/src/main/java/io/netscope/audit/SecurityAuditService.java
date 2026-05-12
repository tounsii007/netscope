package io.netscope.audit;

import io.netscope.common.ClientIpResolver;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Repository;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

@Service
public class SecurityAuditService {

    public enum Severity { INFO, WARN, ALERT }

    private final SecurityEventRepository repo;
    public SecurityAuditService(SecurityEventRepository repo) { this.repo = repo; }

    @Async
    public void record(String type, Severity sev, HttpServletRequest req, UUID apiKey, Map<String, Object> details) {
        try {
            repo.save(new SecurityEvent(type, sev.name(), ClientIpResolver.clientIp(req), apiKey, details));
        } catch (Exception ignored) { /* never break the request */ }
    }
}

@Repository
interface SecurityEventRepository extends JpaRepository<SecurityEvent, Long> {}
