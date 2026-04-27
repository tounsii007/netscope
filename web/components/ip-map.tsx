"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";

const icon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#f97316;box-shadow:0 0 0 4px rgba(249,115,22,0.25);border:2px solid white"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

/**
 * Inner component — Leaflet's MapContainer caches its initial center+zoom.
 * When the parent passes a new lat/lon (i.e. the user looked up a different
 * IP) we use the useMap hook to fly the map there explicitly.
 */
function FlyTo({ lat, lon, zoom }: { lat: number; lon: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], zoom, { animate: true, duration: 0.8 });
  }, [lat, lon, zoom, map]);
  return null;
}

export default function IpMap({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  // Higher zoom = closer view. 11 ≈ city level, good for IP geolocation
  // accuracy which is typically city- or postcode-level.
  const ZOOM = 11;
  return (
    <div className="h-[360px] w-full">
      <MapContainer center={[lat, lon]} zoom={ZOOM} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Marker position={[lat, lon]} icon={icon}>
          <Popup>{label}</Popup>
        </Marker>
        <FlyTo lat={lat} lon={lon} zoom={ZOOM} />
      </MapContainer>
    </div>
  );
}
