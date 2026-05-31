package io.netscope.config;

import com.fasterxml.jackson.core.StreamReadConstraints;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Jackson StreamReadConstraints — caps how big a JSON payload can be
 * BEFORE it lands on the heap.
 *
 * Defaults (Spring Boot 3.5 / Jackson 2.18):
 *   maxStringLength   = 20 MB
 *   maxNestingDepth   = 1000
 *   maxNumberLength   = 1000
 *
 * 20 MB is far beyond anything any legitimate caller of our API
 * needs — every @RequestBody DTO has @Size or @NotBlank constraints
 * that top out in the kilobytes. The defaults exist for big-data
 * Jackson use-cases; they're hostile to a REST API where a single
 * malicious 19 MB JSON body causes an OOM before Bean Validation
 * has a chance to reject it.
 *
 * F-RD2-08 (2026 Q2 security review round 2): an unauthenticated
 * POST of a 19 MB JSON string was demonstrably allocatable by
 * Spring's MappingJackson2HttpMessageConverter before validation.
 *
 * Note on overall request size: Spring Boot's
 * {@code server.tomcat.max-http-form-post-size} only caps
 * {@code application/x-www-form-urlencoded} bodies — JSON bodies
 * are NOT covered. There is no first-class Spring Boot property
 * for "max JSON body size", so we rely on the per-string /
 * per-nesting / per-number caps below plus the reverse-proxy
 * {@code client_max_body_size} in front of the app to bound the
 * total bytes that ever reach the JVM.
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer streamReadConstraints() {
        return builder -> builder.postConfigurer(om ->
            om.getFactory().setStreamReadConstraints(
                StreamReadConstraints.builder()
                    .maxStringLength(64_000)       // 64 KB per JSON string
                    .maxNestingDepth(64)           // far above legitimate nesting
                    .maxNumberLength(100)          // any sane numeric value
                    .build()));
    }
}
