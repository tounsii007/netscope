package io.netscope.ip.sources;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;

/**
 * Builds the ordered list of active sources for one aggregator call.
 *
 * Sources that require an API key skip themselves silently when the
 * key isn't configured — they simply don't appear in the returned
 * list, instead of failing every request with a missing-config error.
 *
 * Order matters: it determines the order results appear in the JSON
 * response, which is also the rendering order on the frontend.
 */
public final class IpSourceRegistry {
    private IpSourceRegistry() {}

    public static List<IpSourceFetcher> build(RestClient rc, ObjectMapper m,
            String ipinfoToken, String ipGeolocationKey) {
        List<IpSourceFetcher> out = new ArrayList<>();
        out.add(new IpInfoFetcher(rc, m, ipinfoToken));
        out.add(new IpApiCoFetcher(rc, m));
        out.add(new IpWhoIsFetcher(rc, m));
        out.add(new DbIpFetcher(rc, m));
        if (ipGeolocationKey != null && !ipGeolocationKey.isBlank()) {
            out.add(new IpGeolocationIoFetcher(rc, m, ipGeolocationKey));
        }
        return out;
    }
}
