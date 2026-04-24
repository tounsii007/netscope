"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const icon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#f97316;box-shadow:0 0 0 4px rgba(249,115,22,0.25);border:2px solid white"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export default function IpMap({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  return (
    <div className="h-[360px] w-full">
      <MapContainer center={[lat, lon]} zoom={5} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Marker position={[lat, lon]} icon={icon}>
          <Popup>{label}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
