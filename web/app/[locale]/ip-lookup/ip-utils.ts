/**
 * Strip every whitespace character from anywhere inside an IP literal.
 * Users often paste with leading/trailing spaces or with stray spaces
 * between octets — none of those should produce "invalid IP".
 */
export function normaliseIp(input: string): string {
  return input.replace(/\s+/g, "").trim();
}

/**
 * Map a 0–100 risk score to a status colour. Thresholds match the rest
 * of the dashboard's danger/warn/success palette so the UI stays
 * consistent across tools.
 */
export function riskColor(score: number) {
  if (score >= 70) return "#ef4444"; // danger red
  if (score >= 40) return "#f59e0b"; // warn amber
  return "#10b981";                   // success green
}
