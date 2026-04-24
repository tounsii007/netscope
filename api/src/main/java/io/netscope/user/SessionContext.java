package io.netscope.user;

import java.util.UUID;

public class SessionContext {
    public record Session(UUID userId, String email) {}

    private static final ThreadLocal<Session> CURRENT = new ThreadLocal<>();
    public static void set(Session s) { CURRENT.set(s); }
    public static Session get() { return CURRENT.get(); }
    public static UUID requireUserId() {
        Session s = CURRENT.get();
        if (s == null) throw new IllegalStateException("not authenticated");
        return s.userId();
    }
    public static void clear() { CURRENT.remove(); }
}
