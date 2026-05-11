import { describe, it, expect } from "vitest";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import hi from "@/messages/hi.json";
// Italian bundle is imported as `itLocale` to avoid shadowing vitest's `it`.
import itLocale from "@/messages/it.json";
import pl from "@/messages/pl.json";
import ru from "@/messages/ru.json";
import tr from "@/messages/tr.json";
import uk from "@/messages/uk.json";
import zh from "@/messages/zh.json";

/**
 * Locks the contract that every locale bundle shares an identical key
 * shape with en.json. If a developer adds a key in en.json without
 * mirroring it to the other ten, this suite fails — preventing
 * "MISSING_MESSAGE" runtime errors in production for non-English users.
 */

type Json = Record<string, unknown>;

function flatten(obj: Json, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Json, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

const enFlat = flatten(en as Json);
const enKeys = Object.keys(enFlat).sort();

describe("i18n message bundles", () => {
  describe.each([
    ["de", de],
    ["es", es],
    ["fr", fr],
    ["hi", hi],
    ["it", itLocale],
    ["pl", pl],
    ["ru", ru],
    ["tr", tr],
    ["uk", uk],
    ["zh", zh],
  ])("%s.json mirrors en.json", (locale, bundle) => {
    const flat = flatten(bundle as Json);
    const keys = Object.keys(flat).sort();

    it("has the same number of keys as en.json", () => {
      expect(keys.length).toBe(enKeys.length);
    });

    it("has no missing keys", () => {
      const missing = enKeys.filter((k) => !keys.includes(k));
      expect(missing).toEqual([]);
    });

    it("has no extra keys", () => {
      const extras = keys.filter((k) => !enKeys.includes(k));
      expect(extras).toEqual([]);
    });

    it("has no empty string values", () => {
      const empties = keys.filter((k) => flat[k] === "");
      expect(empties).toEqual([]);
    });

    it(`preserves all ICU placeholders found in en.json (${locale})`, () => {
      const placeholderRe = /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g;
      const offenders: string[] = [];
      for (const k of enKeys) {
        const enVal = String(enFlat[k] ?? "");
        const tVal  = String(flat[k]   ?? "");
        const enPlaceholders = enVal.match(placeholderRe)?.sort() ?? [];
        const tPlaceholders  = tVal.match(placeholderRe)?.sort() ?? [];
        if (JSON.stringify(enPlaceholders) !== JSON.stringify(tPlaceholders)) {
          offenders.push(`${k}: en=${enPlaceholders.join(",")} ${locale}=${tPlaceholders.join(",")}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  it("has known critical keys present in every locale bundle", () => {
    const required = [
      "nav.switch_lang",
      "nav.skip_to_content",
      "nav.tools.ports",
      "nav.tools.dns",
      "auth.signin_title",
      "not_found.title",
      "not_found.back",
      "common.error",
      "ports.port_status",
      // The target-guard rejection messages — every tool client surfaces
      // these, so a missing key would 500 the entire form.
      "guard.blocked_localhost",
      "guard.blocked_private",
      "guard.blocked_link_local",
      "guard.blocked_metadata",
      "guard.blocked_reserved_tld",
      "guard.invalid_target",
    ];
    for (const bundle of [en, de, es, fr, hi, itLocale, pl, ru, tr, uk, zh]) {
      const flat = flatten(bundle as Json);
      for (const k of required) {
        expect(flat[k], `missing ${k}`).toBeTruthy();
      }
    }
  });
});
