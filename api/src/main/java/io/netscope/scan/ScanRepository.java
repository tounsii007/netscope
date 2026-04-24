package io.netscope.scan;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ScanRepository extends JpaRepository<Scan, UUID> {}
