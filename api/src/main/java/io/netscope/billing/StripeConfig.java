package io.netscope.billing;

import com.stripe.Stripe;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(name = "netscope.stripe.secret-key")
public class StripeConfig {
    @Value("${netscope.stripe.secret-key}")
    private String secretKey;

    @PostConstruct void init() { Stripe.apiKey = secretKey; }
}
