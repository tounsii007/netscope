package io.netscope.webhook;

import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Accepts domain events and, for every matching webhook in the workspace,
 * enqueues a delivery row. A separate scheduler picks those up and POSTs them.
 */
@Service
public class WebhookPublisher {

    public record DomainEvent(UUID workspaceId, String type, Map<String, Object> data) {}

    private final WebhookRepository webhooks;
    private final WebhookDeliveryRepository deliveries;

    public WebhookPublisher(WebhookRepository w, WebhookDeliveryRepository d) {
        this.webhooks = w; this.deliveries = d;
    }

    @EventListener
    @Async
    @Transactional
    public void onEvent(DomainEvent event) {
        for (Webhook w : webhooks.findByWorkspaceIdAndActiveTrue(event.workspaceId())) {
            if (w.getEvents().contains("*") || w.getEvents().contains(event.type())) {
                deliveries.save(new WebhookDelivery(w.getId(), event.type(),
                    Map.of("type", event.type(), "data", event.data())));
            }
        }
    }
}
