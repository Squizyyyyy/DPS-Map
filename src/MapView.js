import React, { useState, useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Иконки
const policeIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/128/5959/5959568.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
});

const staleIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/128/5959/5959568.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
  className: 'grayscale-icon',
});

let lastAddTime = 0;
let lastDeleteTime = 0;

// Исправленный LocationMarker
function LocationMarker({ onAddMarker }) {
  const map = useMap();

  useEffect(() => {
    const handleClick = (e) => {
      const { lat, lng } = e.latlng;
      const now = Date.now();

      if (now - lastAddTime < 5 * 60 * 1000) {
        toast.warn('Добавлять метки можно раз в 5 минут');
        return;
      }

      const confirmAdd = window.confirm("Вы уверены, что хотите поставить метку здесь?");
      if (!confirmAdd) return;

      const addComment = window.confirm("Добавить комментарий к метке?");
      let comment = '';
      if (addComment) {
        comment = window.prompt("Введите комментарий к метке:") || '';
      }

      fetch('https://dps-map-rzn-h0uq.onrender.com/markers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, comment }),
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
        .catch(() => {
          toast.error('Ошибка при добавлении метки');
        });
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick); // удаляем обработчик при размонтировании
    };
  }, [map, onAddMarker]);

  return null;
}

// Центрирование карты
function CenterMap({ city }) {
  const map = useMap();

  useEffect(() => {
    if (city && city.coords) {
      map.setView(city.coords, 13);
    }
  }, [city, map]);

  return null;
}

export default function MapView({ city }) {
  const [markers, setMarkers] = useState([]);

  useEffect(() => {
    fetchMarkers();
    const interval = setInterval(fetchMarkers, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMarkers = () => {
    fetch('https://dps-map-rzn-h0uq.onrender.com/markers')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => setMarkers(data))
      .catch(() => {
        toast.error('Ошибка сети при загрузке меток');
      });
  };

  const handleConfirm = (id) => {
    fetch(`https://dps-map-rzn-h0uq.onrender.com/markers/${id}/confirm`, { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error('Ошибка подтверждения');
        setMarkers((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, confirmations: (m.confirmations || 0) + 1 } : m
          )
        );
        toast.success('Метка подтверждена');
      })
      .catch(() => toast.error('Ошибка при подтверждении'));
  };

  const handleDelete = (id) => {
    const now = Date.now();
    if (now - lastDeleteTime < 5 * 60 * 1000) {
      toast.warn('Удалять метки можно раз в 5 минут');
      return;
    }

    fetch(`https://dps-map-rzn-h0uq.onrender.com/markers/${id}/delete`, { method: 'POST' })
      .then((res) => {
        if (res.status === 429) {
          toast.warn('Удалять метки можно раз в 5 минут');
        } else if (res.ok) {
          lastDeleteTime = Date.now();
          setMarkers((prev) => prev.filter((m) => m.id !== id));
          toast.success('Метка удалена');
        } else {
          toast.error('Ошибка при удалении');
        }
      })
      .catch(() => toast.error('Ошибка при удалении'));
  };

  const onAddMarker = () => {
    fetchMarkers();
  };

  // Радиус границ карты
  const BOUND_LAT_DIFF = 0.21;
  const BOUND_LNG_DIFF = 0.40;

  const maxBounds = city?.coords
    ? [
        [city.coords[0] - BOUND_LAT_DIFF, city.coords[1] - BOUND_LNG_DIFF],
        [city.coords[0] + BOUND_LAT_DIFF, city.coords[1] + BOUND_LNG_DIFF],
      ]
    : [[54.42, 39.32], [54.82, 40.12]];

  return (
    <div style={{ height: '100vh' }}>
      <MapContainer
        center={city?.coords || [54.6296, 39.7412]}
        zoom={13}
        minZoom={11}
        maxZoom={19}
        maxBounds={maxBounds}
        maxBoundsViscosity={1.0}
        style={{ height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          subdomains={['a','b','c']}
          detectRetina={false}
        />

        <CenterMap city={city} />
        <LocationMarker onAddMarker={onAddMarker} />

        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={marker.status === 'unconfirmed' ? staleIcon : policeIcon}
          >
            <Popup>
              {marker.status === 'unconfirmed' ? (
                <p>⚠️ Метка устарела (не подтверждена)</p>
              ) : (
                <p>🚓 ДПС здесь</p>
              )}
              <p><b>Адрес:</b> {marker.address || 'Адрес не определён'}</p>
              <p>⏱️ Поставлена: {new Date(marker.timestamp).toLocaleString()}</p>

              {marker.comment && marker.comment.trim() !== '' && (
                <p><b>Комментарий:</b> {marker.comment}</p>
              )}

              <p><b>Подтверждений:</b> {marker.confirmations || 0}</p>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <button onClick={() => handleConfirm(marker.id)}>✅ Подтвердить</button>
                <button
                  onClick={() => {
                    const confirmDelete = window.confirm('Вы уверены, что хотите удалить метку?');
                    if (confirmDelete) {
                      handleDelete(marker.id);
                    }
                  }}
                >
                  ❌ Уехали
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <ToastContainer position="bottom-right" autoClose={3000} />
      <style>{`
        .leaflet-marker-icon.grayscale-icon {
          filter: grayscale(100%);
        }
        .leaflet-control-attribution .leaflet-attribution-flag {
          display: none !important;
        }
      `}</style>
    </div>
  );
}