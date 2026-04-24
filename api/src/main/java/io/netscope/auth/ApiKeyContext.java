package io.netscope.auth;

/**
 * Propagates the caller's API key through the request. Populated by
 * {@link ApiKeyFilter} and read by services that need owner info or plan limits.
 */
public class ApiKeyContext {
    private static final ThreadLocal<ApiKey> CURRENT = new ThreadLocal<>();

    public static void set(ApiKey k) { CURRENT.set(k); }
    public static ApiKey get() { return CURRENT.get(); }
    public static void clear() { CURRENT.remove(); }
}
