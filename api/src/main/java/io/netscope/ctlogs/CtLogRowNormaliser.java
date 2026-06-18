package io.netscope.ctlogs;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Reshapes a single crt.sh JSON row into our response shape: ISO-only
 * dates, computed expiry, SAN list as an array, all field names
 * camelCased. Skip-on-failure: malformed rows return null so the
 * caller can filter them out.
 *
 * Why this is its own class: crt.sh occasionally tweaks field names,
 * adds optional metadata, or changes timezone formatting in bulk
 * imports. Keeping the row-shape adapter isolated means a single
 * place to update when upstream changes.
 */
public final class CtLogRowNormaliser {
    private CtLogRowNormaliser() {}

    public static Map<String, Object> normalise(Map<String, Object> row, LocalDate today) {
        try {
            String notBefore = (String) row.get("not_before");
            String notAfter  = (String) row.get("not_after");
            if (notBefore == null || notAfter == null) return null;

            LocalDate before = LocalDate.parse(safePrefix(notBefore, 10));
            LocalDate after  = LocalDate.parse(safePrefix(notAfter, 10));

            Map<String, Object> n = new LinkedHashMap<>();
            n.put("id",              row.get("id"));
            n.put("serial",          row.get("serial_number"));
            n.put("commonName",      row.get("common_name"));
            n.put("nameValue",       row.get("name_value"));
            n.put("issuerCaName",    row.get("issuer_name"));
            n.put("issuerCaId",      row.get("issuer_ca_id"));
            n.put("notBefore",       notBefore);
            n.put("notAfter",        notAfter);
            n.put("validForDays",    (int) (after.toEpochDay() - before.toEpochDay()));
            n.put("expired",         after.isBefore(today));
            n.put("daysUntilExpiry", (int) (after.toEpochDay() - today.toEpochDay()));
            n.put("sans",            splitSans(row.get("name_value")));
            return n;
        } catch (Exception e) {
            return null;
        }
    }

    private static List<String> splitSans(Object nameValue) {
        if (!(nameValue instanceof String nv)) return List.of();
        return Arrays.stream(nv.split("\\R"))
            .map(String::trim).filter(s -> !s.isEmpty())
            .distinct().collect(Collectors.toList());
    }

    private static String safePrefix(String s, int n) {
        if (s == null) return "1970-01-01";
        return s.length() >= n ? s.substring(0, n) : s;
    }
}
