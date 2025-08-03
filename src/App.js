import React, { useState, useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Цветная полицейская машинка
const policeIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/128/5959/5959568.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
});

// Серая иконка (устаревшая)
const staleIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/128/5959/5959568.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
  className: 'grayscale-icon',
});

function LocationMarker({ onAddMarker }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;

      const confirmAdd = window.confirm("Вы уверены, что хотите поставить метку здесь?");
      if (!confirmAdd) return;

      fetch('http://localhost:5000/markers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      })
        .then(async (res) => {
          if (res.status === 429) {
            toast.warn('Ошибка. Добавить метку можно не чаще 1 раза/5 мин');
            return;
          }

          if (!res.ok) {
            throw new Error('Ошибка при добавлении');
          }

          const data = await res.json();
          onAddMarker(data);
          toast.success('Метка добавлена');
        })
        .catch(() => {
          toast.error('Ошибка при добавлении метки');
        });
    },
  });

  return null;
}

export default function App() {
  const [markers, setMarkers] = useState([]);

  useEffect(() => {
    fetchMarkers();
    const interval = setInterval(fetchMarkers, 30000); // обновлять каждые 30 сек
    return () => clearInterval(interval);
  }, []);

  const fetchMarkers = () => {
    fetch('http://localhost:5000/markers')
      .then((res) => res.json())
      .then((data) => setMarkers(data))
      .catch(() => {
        toast.error('Ошибка сети при загрузке меток');
      });
  };

  const handleConfirm = (id) => {
    fetch(`http://localhost:5000/markers/${id}/confirm`, { method: 'POST' })
      .then(() => {
        fetchMarkers();
        toast.success('Метка подтверждена');
      })
      .catch(() => toast.error('Ошибка при подтверждении'));
  };

  const handleDelete = (id) => {
    fetch(`http://localhost:5000/markers/${id}/delete`, { method: 'POST' })
      .then((res) => {
        if (res.status === 429) {
          toast.warn('Ошибка. Удалить метку можно не чаще 1 раз/5 мин');
        } else if (res.ok) {
          fetchMarkers();
          toast.success('Метка удалена');
        } else {
          toast.error('Ошибка при удалении');
        }
      })
      .catch(() => toast.error('Ошибка при удалении'));
  };

  const onAddMarker = (marker) => {
    setMarkers((prev) => [...prev, marker]);
  };

  const ryazanBounds = [
    [53.8, 38.5], // Юго-западная граница
    [55.2, 41.2]  // Северо-восточная граница
  ];

  return (
    <div style={{ height: '100vh' }}>
      <MapContainer
        center={[54.62, 39.72]}
        zoom={13}
		minZoom={11}
		maxZoom={19}
        maxBounds={[[54.42, 39.32], [54.82, 40.12]]}
        maxBoundsViscosity={1.0}
        style={{ height: '100%' }}
      >
        <TileLayer
          url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
        />
        <LocationMarker onAddMarker={onAddMarker} />
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={marker.status === 'stale' ? staleIcon : policeIcon}
          >
            <Popup>
              {marker.status === 'stale' ? (
                <p>⚠️ Метка устарела (не подтверждена)</p>
              ) : (
                <p>🚓 ДПС здесь</p>
              )}
              <p><b>Адрес:</b> {marker.address || 'Адрес не определён'}</p>
              <p>⏱️ Поставлена: {new Date(marker.timestamp).toLocaleString()}</p>
              <button onClick={() => handleConfirm(marker.id)}>Подтвердить</button>
              <br />
              <button onClick={() => handleDelete(marker.id)}>Уже нет</button>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <ToastContainer position="bottom-right" autoClose={3000} />
      <style>{`
        .leaflet-marker-icon.grayscale-icon {
          filter: grayscale(100%);
        }
      `}</style>
    </div>
  );
}
