package io.netscope.scan;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Field;
import java.util.Map;

@Aspect
@Component
public class ScanAuditAspect {

    private final ScanRepository repo;
    private final ObjectMapper mapper = new ObjectMapper();

    public ScanAuditAspect(ScanRepository repo) { this.repo = repo; }

    @Around("@annotation(io.netscope.scan.ScanAudit)")
    public Object audit(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.currentTimeMillis();
        Object result = pjp.proceed();
        long duration = System.currentTimeMillis() - start;
        try {
            ScanAudit annotation = ((MethodSignature) pjp.getSignature()).getMethod().getAnnotation(ScanAudit.class);
            persist(annotation.tool(), extractTarget(pjp), result, (int) duration);
        } catch (Exception ignored) { /* audit must never break the request */ }
        return result;
    }

    @Async
    void persist(String tool, String target, Object result, int durationMs) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> asMap = mapper.convertValue(result, Map.class);
            ServletRequestAttributes attr = (ServletRequestAttributes) RequestContextHolder.currentRequestAttributes();
            HttpServletRequest req = attr.getRequest();
            String ip = req.getHeader("X-Forwarded-For");
            if (ip == null || ip.isBlank()) ip = req.getRemoteAddr();
            else ip = ip.split(",")[0].trim();
            repo.save(new Scan(tool, target, ip, asMap, durationMs));
        } catch (Exception ignored) {}
    }

    private String extractTarget(ProceedingJoinPoint pjp) {
        for (Object arg : pjp.getArgs()) {
            if (arg == null) continue;
            if (arg instanceof String s && s.length() < 256) return s;
            try {
                for (Field f : arg.getClass().getDeclaredFields()) {
                    if (f.getName().equals("target") || f.getName().equals("domain") || f.getName().equals("host")) {
                        f.setAccessible(true);
                        Object v = f.get(arg);
                        if (v instanceof String s) return s;
                    }
                }
                // records: use accessor
                try {
                    var m = arg.getClass().getMethod("target");
                    Object v = m.invoke(arg);
                    if (v instanceof String s) return s;
                } catch (NoSuchMethodException ignore) {}
            } catch (Exception ignored) {}
        }
        return "unknown";
    }
}
