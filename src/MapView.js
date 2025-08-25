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

// ---------------------- Иконки ----------------------
const policeIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/128/5959/5959568.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
  className: 'pulse-icon',
});

const staleIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/128/5959/5959568.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
  className: 'grayscale-icon',
});

// ---------------------- Локальные ограничения ----------------------
let lastAddTime = 0;
let lastDeleteTime = 0;

// ---------------------- Компонент добавления метки ----------------------
function LocationMarker({ onAddMarker }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      const now = Date.now();

      if (now - lastAddTime < 5 * 60 * 1000) {
        toast.warn('Добавлять метки можно раз в 5 минут');
        return;
      }

      if (!window.confirm("Вы уверены, что хотите поставить метку здесь?")) return;

      let comment = '';
      if (window.confirm("Добавить комментарий к метке?")) {
        comment = window.prompt("Введите комментарий к метке:") || '';
      }

      fetch('/markers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, comment }),
        credentials: 'include'
      })
        .then(async (res) => {
          if (res.status === 429) {
            toast.warn('Добавлять метки можно раз в 5 минут');
            return;
          }
          if (!res.ok) throw new Error('Ошибка при добавлении');
          await res.json();
          lastAddTime = Date.now();
          onAddMarker();
          toast.success('Метка добавлена');
        })
        .catch(() => toast.error('Ошибка при добавлении метки'));
    },
  });

  return null;
}

// ---------------------- Основной компонент ----------------------
export default function MapView() {
  const [markers, setMarkers] = useState([]);

  // ---------------------- Загрузка меток ----------------------
  const fetchMarkers = () => {
    fetch('/markers', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => setMarkers(data))
      .catch(() => toast.error('Ошибка сети при загрузке меток'));
  };

  useEffect(() => {
    fetchMarkers();
    const interval = setInterval(fetchMarkers, 30000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------- Проверка времени жизни меток ----------------------
  useEffect(() => {
    const interval = setInterval(() => {
      setMarkers(prev =>
        prev
          .map(m => {
            const now = Date.now();
            const diff = now - new Date(m.timestamp).getTime();
            if (diff >= 90 * 60 * 1000) return null;
            if (diff >= 60 * 60 * 1000) return { ...m, status: 'stale' };
            return { ...m, status: 'active' };
          })
          .filter(Boolean)
      );
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------- Действия ----------------------
  const handleConfirm = id => {
    fetch(`/markers/${id}/confirm`, { method: 'POST', credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Ошибка подтверждения');
        setMarkers(prev =>
          prev.map(m => m.id === id
            ? { ...m, confirmations: (m.confirmations || 0) + 1, timestamp: new Date().toISOString(), status: 'active' }
            : m
          )
        );
        toast.success('Метка подтверждена');
      })
      .catch(() => toast.error('Ошибка при подтверждении'));
  };

  const handleDelete = id => {
    const now = Date.now();
    if (now - lastDeleteTime < 5 * 60 * 1000) {
      toast.warn('Удалять метки можно раз в 5 минут');
      return;
    }

    fetch(`/markers/${id}/delete`, { method: 'POST', credentials: 'include' })
      .then(res => {
        if (res.status === 429) toast.warn('Удалять метки можно раз в 5 минут');
        else if (res.ok) {
          lastDeleteTime = Date.now();
          setMarkers(prev => prev.filter(m => m.id !== id));
          toast.success('Метка удалена');
        } else toast.error('Ошибка при удалении');
      })
      .catch(() => toast.error('Ошибка при удалении'));
  };

  return (
    <div style={{ height: '100vh' }}>
      <MapContainer
        center={[54.6296, 39.7412]}
        zoom={13}
        minZoom={11}
        maxZoom={19}
        maxBounds={[[54.42, 39.32], [54.82, 40.12]]}
        maxBoundsViscosity={1.0}
        style={{ height: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <LocationMarker onAddMarker={fetchMarkers} />

        {markers.map(marker => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={marker.status === 'stale' ? staleIcon : policeIcon}
          >
            <Popup>
              <div className="p-3 w-64 bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {marker.status === 'stale' ? (
                    <span className="text-yellow-600 font-bold">⚠️ Метка устарела</span>
                  ) : (
                    <span className="text-blue-600 font-bold">🚓 ДПС здесь</span>
                  )}
                  <span className="ml-auto text-sm text-gray-500">
                    {new Date(marker.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="text-gray-700 text-sm flex items-center gap-1">
                  <span>📍</span> {marker.address || 'Адрес не определён'}
                </div>

                {marker.comment && marker.comment.trim() !== '' && (
                  <div className="text-gray-600 text-sm italic bg-gray-50 p-2 rounded-md border border-gray-100">
                    💬 {marker.comment}
                  </div>
                )}

                <div className="flex items-center justify-between mt-2">
                  <span className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-1 rounded-full">
                    ✅ {marker.confirmations || 0}
                  </span>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConfirm(marker.id)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 transition"
                    >
                      Подтвердить
                    </button>
                    <button
                      onClick={() => { if (window.confirm('Вы уверены, что хотите удалить метку?')) handleDelete(marker.id); }}
                      className="px-3 py-1 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 transition"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <ToastContainer position="bottom-right" autoClose={3000} />

      <style>{`
        .leaflet-marker-icon.grayscale-icon { filter: grayscale(100%); }
        .pulse-icon { animation: pulse 1.5s infinite; }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        .leaflet-control-attribution .leaflet-attribution-flag { display: none !important; }
      `}</style>
    </div>
  );
}
