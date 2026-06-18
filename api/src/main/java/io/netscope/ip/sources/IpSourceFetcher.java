package io.netscope.ip.sources;

import java.util.Map;

/**
 * Strategy interface for one geolocation source.
 *
 * Each concrete implementation lives in its own file under this
 * package so adding a new source is a single-file change (plus one
 * line in {@link IpSourceRegistry}). All fetchers MUST be side-effect
 * free — the orchestrator wraps every call in its own timeout and
 * error handler, so implementations should just translate JSON.
 */
public interface IpSourceFetcher {
    String name();
    String url(String ip);
    Map<String, Object> fetch(String ip) throws Exception;
}
