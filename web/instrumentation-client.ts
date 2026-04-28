/**
 * Next.js client-instrumentation hook.
 *
 * Next 15 calls `onRouterTransitionStart` and `reportWebVitals` from
 * this module on every navigation / vitals-emit. We forward the
 * vitals into our buffered reporter (lib/web-vitals.ts).
 *
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 */
import { recordVital } from "./lib/web-vitals";

export function onRouterTransitionStart() {
  /* hook intentionally empty — leave room for future routing analytics */
}

export function reportWebVitals(metric: {
  name: string;
  value: number;
  id: string;
  rating?: string;
  navigationType?: string;
}) {
  recordVital(metric);
}
