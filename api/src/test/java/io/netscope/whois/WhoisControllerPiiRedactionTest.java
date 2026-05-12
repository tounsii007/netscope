package io.netscope.whois;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests the PII-stripping helper. RDAP bodies from registries that
 * don't run a privacy-proxy include registrant/admin/tech contacts
 * with name, email, phone, postal address — we must NOT pass those
 * through to the public API response.
 */
class WhoisControllerPiiRedactionTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test void stripsRegistrantContact() throws Exception {
        String rdap = """
            {
              "entities": [
                {
                  "roles": ["registrant"],
                  "vcardArray": ["vcard", [
                    ["fn", {}, "text", "Alice Owner"],
                    ["email", {}, "text", "alice@example.com"],
                    ["tel", {}, "uri", "tel:+1-555-0100"]
                  ]]
                },
                {
                  "roles": ["registrar"],
                  "vcardArray": ["vcard", [["fn", {}, "text", "Acme Registrar Inc."]]]
                }
              ]
            }
            """;
        JsonNode body = mapper.readTree(rdap);
        JsonNode redacted = WhoisController.redactRegistrantPii(body);

        JsonNode entities = redacted.path("entities");
        assertThat(entities.isArray()).isTrue();
        assertThat(entities.size())
            .as("only the registrar contact should survive")
            .isEqualTo(1);
        assertThat(entities.get(0).path("roles").get(0).asText()).isEqualTo("registrar");

        // Ensure no PII strings are anywhere in the serialised body
        String serialised = mapper.writeValueAsString(redacted);
        assertThat(serialised).doesNotContain("Alice Owner");
        assertThat(serialised).doesNotContain("alice@example.com");
        assertThat(serialised).doesNotContain("555-0100");
    }

    @Test void stripsAdminAndTechContacts() throws Exception {
        String rdap = """
            {
              "entities": [
                { "roles": ["administrative"], "vcardArray": ["vcard", [["fn",{},"text","Admin Person"]]] },
                { "roles": ["technical"],      "vcardArray": ["vcard", [["fn",{},"text","Tech Person"]]] },
                { "roles": ["abuse"],          "vcardArray": ["vcard", [["fn",{},"text","Abuse Desk"]]] }
              ]
            }
            """;
        JsonNode body = mapper.readTree(rdap);
        JsonNode redacted = WhoisController.redactRegistrantPii(body);

        JsonNode entities = redacted.path("entities");
        assertThat(entities.size())
            .as("only abuse contact should survive")
            .isEqualTo(1);
        assertThat(entities.get(0).path("roles").get(0).asText()).isEqualTo("abuse");
    }

    @Test void preservesNonEntityFields() throws Exception {
        // Status, nameservers, events, ldhName, handle etc. should all
        // pass through untouched — only the entities array is filtered.
        String rdap = """
            {
              "handle": "EX-2025",
              "ldhName": "example.com",
              "status": ["client transfer prohibited"],
              "nameservers": [{"ldhName":"ns1.example.com"}],
              "events": [{"eventAction":"registration","eventDate":"2000-01-01"}],
              "entities": []
            }
            """;
        JsonNode body = mapper.readTree(rdap);
        JsonNode redacted = WhoisController.redactRegistrantPii(body);

        assertThat(redacted.path("handle").asText()).isEqualTo("EX-2025");
        assertThat(redacted.path("ldhName").asText()).isEqualTo("example.com");
        assertThat(redacted.path("status").size()).isEqualTo(1);
        assertThat(redacted.path("nameservers").size()).isEqualTo(1);
        assertThat(redacted.path("events").size()).isEqualTo(1);
    }

    @Test void nullAndNonObjectInputsReturnUnchanged() {
        assertThat(WhoisController.redactRegistrantPii(null)).isNull();
        assertThat(WhoisController.redactRegistrantPii(mapper.createArrayNode()))
            .as("non-object input is returned as-is — no entities to strip")
            .isNotNull();
    }

    @Test void contactWithMultipleRolesIncludingRegistrarIsKept() throws Exception {
        // Some registries combine roles like ["registrar","sponsor"].
        // The whitelist match must accept any role match.
        String rdap = """
            {
              "entities": [
                { "roles": ["sponsor", "registrar"], "vcardArray": ["vcard", []] }
              ]
            }
            """;
        JsonNode redacted = WhoisController.redactRegistrantPii(mapper.readTree(rdap));
        assertThat(redacted.path("entities").size()).isEqualTo(1);
    }
}
