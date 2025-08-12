import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Иконки Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function LocationMarker({ onAdd }) {
  useMapEvents({
    click(e) {
      onAdd(e.latlng);
    },
  });
  return null;
}

export default function Map() {
  const [markers, setMarkers] = useState([]);

  const addMarker = (latlng) => {
    setMarkers((prev) => [...prev, latlng]);
  };

  return (
    <MapContainer
      center={[55.75, 37.62]}
      zoom={13}
      zoomSnap={0.25}
      zoomDelta={0.25}
      detectRetina={true}
      style={{ height: '100vh', width: '100%' }}
    >
      <TileLayer
        attribution='Map data © <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}@2x.png"
      />
      {markers.map((pos, idx) => (
        <Marker key={idx} position={pos}>
          <Popup>ДПС тут стоит</Popup>
        </Marker>
      ))}
      <LocationMarker onAdd={addMarker} />
    </MapContainer>
  );
}
