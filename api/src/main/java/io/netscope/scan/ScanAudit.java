package io.netscope.scan;

import java.lang.annotation.*;

/**
 * Mark a controller method so its result is persisted into the scans table.
 * The target path variable or request body field 'target' is recorded.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface ScanAudit {
    String tool();
}
