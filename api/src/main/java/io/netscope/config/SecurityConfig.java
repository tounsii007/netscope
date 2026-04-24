package io.netscope.config;

import io.netscope.auth.ApiKeyFilter;
import io.netscope.common.RateLimitFilter;
import io.netscope.user.SessionFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.autoconfigure.security.servlet.EndpointRequest;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.PermissionsPolicyHeaderWriter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class SecurityConfig {

    @Value("${netscope.cors.allowed-origins}")
    private String allowedOrigins;

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http, ApiKeyFilter apiKeyFilter,
            SessionFilter sessionFilter, RateLimitFilter rateLimitFilter) throws Exception {
        http
            .csrf(csrf -> csrf.ignoringRequestMatchers(
                "/api/v1/billing/webhook",           // Stripe sends raw body with its own signature
                "/api/v1/status-pages/public/**",    // public, no session
                "/api/v1/auth/**"
            ).disable())
            .cors(Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .formLogin(f -> f.disable())
            .httpBasic(b -> b.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(EndpointRequest.to(HealthEndpoint.class)).permitAll()
                .requestMatchers(EndpointRequest.toAnyEndpoint()).denyAll()
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/api/v1/billing/webhook").permitAll()
                .requestMatchers("/api/v1/status-pages/public/**").permitAll()
                .requestMatchers("/api/v1/auth/**").permitAll()
                .anyRequest().permitAll() // fine-grained auth handled by ApiKey/Session filters
            )
            .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(apiKeyFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(sessionFilter, UsernamePasswordAuthenticationFilter.class)
            .headers(h -> h
                .contentSecurityPolicy(c -> c.policyDirectives(
                    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"))
                .httpStrictTransportSecurity(hsts -> hsts
                    .includeSubDomains(true).preload(true).maxAgeInSeconds(31536000))
                .referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                .permissionsPolicyHeader(p -> p.policy(
                    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
                        + "magnetometer=(), microphone=(), payment=(), usb=()"))
                .frameOptions(f -> f.deny())
                .crossOriginOpenerPolicy(c -> c.policy(
                    org.springframework.security.web.header.writers.CrossOriginOpenerPolicyHeaderWriter
                        .CrossOriginOpenerPolicy.SAME_ORIGIN))
                .crossOriginResourcePolicy(c -> c.policy(
                    org.springframework.security.web.header.writers.CrossOriginResourcePolicyHeaderWriter
                        .CrossOriginResourcePolicy.SAME_ORIGIN))
            );
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("Content-Type", "X-API-Key", "Accept"));
        cfg.setExposedHeaders(List.of("X-RateLimit-Remaining", "X-RateLimit-Limit", "Retry-After"));
        cfg.setAllowCredentials(false);
        cfg.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/api/**", cfg);
        return src;
    }
}
