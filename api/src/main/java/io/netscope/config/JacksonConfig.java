package io.netscope.config;

import org.springframework.boot.jackson.autoconfigure.JsonFactoryBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.core.StreamReadConstraints;

/**
 * Jackson StreamReadConstraints — caps how big a JSON payload can be
 * BEFORE it lands on the heap.
 *
 * Spring Boot 4 migration note: Boot 4's web stack now defaults to
 * Jackson 3 (tools.jackson.*), so this customizer was ported from the
 * old Jackson-2 {@code Jackson2ObjectMapperBuilderCustomizer} (package
 * {@code org.springframework.boot.autoconfigure.jackson}, removed in
 * Boot 4) to a {@link JsonFactoryBuilderCustomizer}. Boot 4's
 * {@code JacksonAutoConfiguration} collects all
 * {@code JsonFactoryBuilderCustomizer} beans when it builds the shared
 * {@code JsonFactory}, so applying the constraints here keeps the
 * F-RD2-08 cap on the SAME mapper the request path uses. In Jackson 3
 * stream-read constraints are a first-class TokenStreamFactory option
 * (TSFBuilder#streamReadConstraints), so no per-mapper postConfigurer
 * is needed.
 *
 * Defaults (Jackson 3.1):
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
    public JsonFactoryBuilderCustomizer streamReadConstraints() {
        return builder -> builder.streamReadConstraints(
            StreamReadConstraints.builder()
                .maxStringLength(64_000)       // 64 KB per JSON string
                .maxNestingDepth(64)           // far above legitimate nesting
                .maxNumberLength(100)          // any sane numeric value
                .build());
    }
}
