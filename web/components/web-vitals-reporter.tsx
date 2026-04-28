"use client";

import { useReportWebVitals } from "next/web-vitals";
import { recordVital } from "@/lib/web-vitals";

/**
 * Mounts once at the root of every page and forwards Core Web Vitals
 * (LCP, INP, CLS) plus FCP and TTFB to our buffered reporter, which
 * eventually POSTs them to /api/vitals via sendBeacon.
 *
 * The component renders nothing; it exists purely so that the hook
 * (only legal inside a client component) gets called.
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    recordVital({
      name: metric.name,
      value: metric.value,
      id: metric.id,
      rating: metric.rating,
      navigationType: metric.navigationType,
    });
  });
  return null;
}
