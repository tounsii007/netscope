package io.netscope.common;
import io.netscope.common.errors.ApiException;
import io.netscope.common.security.TargetValidator;

import org.junit.jupiter.api.Test;

import java.net.InetAddress;

import static org.junit.jupiter.api.Assertions.*;

class TargetValidatorTest {

    private final TargetValidator v = new TargetValidator();

    @Test void rejectsLoopback() throws Exception {
        assertTrue(v.isBlocked(InetAddress.getByName("127.0.0.1")));
        assertTrue(v.isBlocked(InetAddress.getByName("::1")));
    }

    @Test void rejectsPrivateRanges() throws Exception {
        assertTrue(v.isBlocked(InetAddress.getByName("10.0.0.1")));
        assertTrue(v.isBlocked(InetAddress.getByName("192.168.1.1")));
        assertTrue(v.isBlocked(InetAddress.getByName("172.16.0.1")));
    }

    @Test void rejectsCloudMetadata() throws Exception {
        assertTrue(v.isBlocked(InetAddress.getByName("169.254.169.254")));
    }

    @Test void allowsPublicIp() throws Exception {
        assertFalse(v.isBlocked(InetAddress.getByName("8.8.8.8")));
        assertFalse(v.isBlocked(InetAddress.getByName("1.1.1.1")));
    }

    @Test void rejectsInvalidHostnames() {
        assertThrows(ApiException.class, () -> v.resolveAndValidate(""));
        assertThrows(ApiException.class, () -> v.resolveAndValidate("invalid hostname with spaces"));
        assertThrows(ApiException.class, () -> v.resolveAndValidate("<script>alert(1)</script>"));
    }

    @Test void rejectsPrivateHostnamesAfterResolution() {
        assertThrows(ApiException.class, () -> v.resolveAndValidate("localhost"));
    }
}
