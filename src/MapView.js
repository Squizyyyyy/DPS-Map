import React, { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Иконки
const policeIconUrl = 'https://cdn-icons-png.flaticon.com/128/5959/5959568.png';
const staleIconUrl = 'https://cdn-icons-png.flaticon.com/128/5959/5959568.png';

let lastAddTime = 0;
let lastDeleteTime = 0;

export default function MapView() {
  const [markers, setMarkers] = useState([]);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const mapMarkers = useRef([]);

  // Инициализация карты
  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [39.72, 54.62],
      zoom: 13,
      minZoom: 11,
      maxZoom: 19
    });

    map.current.setMaxBounds([
      [39.32, 54.42], // юго-запад
      [40.12, 54.82]  // северо-восток
    ]);

    map.current.addControl(new maplibregl.NavigationControl());

    // Добавление маркера по клику
    map.current.on('click', (e) => {
      const { lng, lat } = e.lngLat;
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
          fetchMarkers();
          toast.success('Метка добавлена');
        })
        .catch(() => toast.error('Ошибка при добавлении метки'));
    });
  }, []);

  // Загрузка маркеров
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
      .catch(() => toast.error('Ошибка сети при загрузке меток'));
  };

  const handleConfirm = (id) => {
    fetch(`https://dps-map-rzn-h0uq.onrender.com/markers/${id}/confirm`, { method: 'POST' })
      .then(() => {
        fetchMarkers();
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
          fetchMarkers();
          toast.success('Метка удалена');
        } else {
          toast.error('Ошибка при удалении');
        }
      })
      .catch(() => toast.error('Ошибка при удалении'));
  };

  // Добавление маркеров на карту
  useEffect(() => {
    if (!map.current) return;

    // Удаляем старые
    mapMarkers.current.forEach(m => m.remove());
    mapMarkers.current = [];

    markers.forEach(marker => {
      const el = document.createElement('div');
      el.style.backgroundImage = `url(${marker.status === 'stale' ? staleIconUrl : policeIconUrl})`;
      el.style.width = '30px';
      el.style.height = '30px';
      el.style.backgroundSize = '100%';
      if (marker.status === 'stale') el.style.filter = 'grayscale(100%)';

      const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
        ${marker.status === 'stale' ? '⚠️ Метка устарела (не подтверждена)' : '🚓 ДПС здесь'}
        <p><b>Адрес:</b> ${marker.address || 'Адрес не определён'}</p>
        <p>⏱️ Поставлена: ${new Date(marker.timestamp).toLocaleString()}</p>
        ${marker.comment && marker.comment.trim() !== '' ? `<p><b>Комментарий:</b> ${marker.comment}</p>` : ''}
        <div style="display:flex; gap:10px; margin-top:5px;">
          <button id="confirm-${marker.id}">✅ Подтвердить</button>
          <button id="delete-${marker.id}">❌ Уже нет</button>
        </div>
      `);

      const mapMarker = new maplibregl.Marker(el)
        .setLngLat([marker.lng, marker.lat])
        .setPopup(popup)
        .addTo(map.current);

      mapMarkers.current.push(mapMarker);

      mapMarker.getElement().addEventListener('click', () => {
        popup.addTo(map.current);
        setTimeout(() => {
          const confirmBtn = document.getElementById(`confirm-${marker.id}`);
          const deleteBtn = document.getElementById(`delete-${marker.id}`);
          if (confirmBtn) confirmBtn.onclick = () => handleConfirm(marker.id);
          if (deleteBtn) deleteBtn.onclick = () => {
            const confirmDelete = window.confirm('Вы уверены, что хотите удалить метку?');
            if (confirmDelete) handleDelete(marker.id);
          };
        }, 0);
      });
    });
  }, [markers]);

  return (
    <>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      <ToastContainer position="bottom-right" autoClose={3000} />
    </>
  );
}
