package io.netscope.port;

import jakarta.validation.constraints.*;

import java.util.List;

public class PortDtos {

    public record PortCheckRequest(
        @NotBlank String target,
        @Min(1) @Max(65535) int port,
        @Pattern(regexp = "tcp|udp") String protocol,
        @Min(100) @Max(10000) Integer timeoutMs
    ) {}

    public record PortCheckResult(
        String target,
        String resolvedIp,
        int port,
        String protocol,
        boolean open,
        Integer latencyMs,
        String service,
        String error
    ) {}

    public record PortScanRequest(
        @NotBlank String target,
        List<Integer> ports,
        Integer fromPort,
        Integer toPort,
        Boolean commonOnly
    ) {}

    public record PortScanResult(
        String target,
        String resolvedIp,
        int totalChecked,
        int openCount,
        long totalMs,
        List<PortCheckResult> results
    ) {}
}
