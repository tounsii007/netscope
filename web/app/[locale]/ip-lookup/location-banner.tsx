"use client";

import { MapPin } from "lucide-react";
import type { IpResult } from "@/lib/api";
import { CountryFlag } from "./country-flag";
import { LocalTime } from "./local-time";
import { ExternalLink } from "./shared-pieces";

/**
 * Prominent header banner above the result grid: flag, full location
 * line, timezone with live local clock, and quick-jump links to the
 * three big map providers when coordinates are present.
 */
export function LocationBanner({
  data,
  locationLine,
}: {
  data: IpResult;
  locationLine: string;
}) {
  if (!locationLine) return null;
  return (
    <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <CountryFlag code={data.country} size="40x30" className="!h-8 !w-auto" />
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-lg font-semibold leading-tight">
            <MapPin className="h-4 w-4 text-brand" />
            <span>{locationLine}</span>
          </div>
          <div className="text-xs text-fg-muted">
            {data.timezone && (
              <>
                <span>{data.timezone}</span>
                <span className="mx-2">·</span>
                <LocalTime tz={data.timezone} />
              </>
            )}
          </div>
        </div>
      </div>
      {data.lat != null && data.lon != null && (
        <div className="flex flex-wrap gap-2">
          <ExternalLink
            href={`https://www.google.com/maps/@${data.lat},${data.lon},14z`}
          >
            Google Maps
          </ExternalLink>
          <ExternalLink
            href={`https://www.openstreetmap.org/?mlat=${data.lat}&mlon=${data.lon}#map=14/${data.lat}/${data.lon}`}
          >
            OpenStreetMap
          </ExternalLink>
          <ExternalLink
            href={`https://www.bing.com/maps?cp=${data.lat}~${data.lon}&lvl=14`}
          >
            Bing Maps
          </ExternalLink>
        </div>
      )}
    </div>
  );
}
