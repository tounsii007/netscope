package io.netscope.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import ua_parser.Parser;

/**
 * Singleton bean for the ua_parser {@link Parser}.
 *
 * Why a bean and not a controller-level field:
 *   • {@link Parser#Parser()} loads a 1.2 MB YAML regex database from the
 *     classpath. That's cheap once, expensive per controller instance.
 *   • Spring controllers are singletons in the default scope, so a field
 *     would NEARLY achieve the same effect — but unit tests that
 *     instantiate the controller directly (no Spring context) end up
 *     loading the YAML twice per JVM. A bean makes the lifecycle
 *     explicit and lets tests stub a no-op parser via {@code @MockBean}.
 *   • Thread safety: {@link Parser#parse(String)} is documented as
 *     stateless after construction. One instance can be shared across
 *     every IP-lookup request safely.
 */
@Configuration
public class UaConfig {

    @Bean
    public Parser userAgentParser() {
        return new Parser();
    }
}
