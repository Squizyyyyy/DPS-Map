// src/MapViewMapGL.js
import React, { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

let lastAddTime = 0;
let lastDeleteTime = 0;

export default function MapViewMapGL({ city }) {
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const popupRef = useRef(null);

  const loadMapGL = () =>
    new Promise((resolve, reject) => {
      if (window.mapgl) return resolve(window.mapgl);
      const script = document.createElement("script");
      script.src = "https://mapgl.2gis.com/api/js/v1";
      script.async = true;
      script.onload = () => resolve(window.mapgl);
      script.onerror = () =>
        reject(new Error("Не удалось загрузить 2ГИС MapGL SDK"));
      document.body.appendChild(script);
    });

  const fetchMarkers = async () => {
    try {
      const res = await fetch("https://dps-map-rzn-h0uq.onrender.com/markers");
      if (!res.ok) throw new Error("Ошибка сети");
      const data = await res.json();

      data.forEach((m) => {
        if (!markersRef.current[m.id]) {
          const iconUrl =
            m.status === "unconfirmed"
              ? "/icons/marker-gray.png"
              : "https://cdn-icons-png.flaticon.com/128/5959/5959568.png";

          const marker = new window.mapgl.Marker(mapRef.current, {
            coordinates: [m.lng, m.lat],
            icon: iconUrl,
            size: [30, 30],
            anchor: [0.5, 1],
          });

          marker.on("click", () => openPopup(m));
          markersRef.current[m.id] = marker;
        }
      });

      // удаляем отсутствующие
      const currentIds = data.map((m) => m.id);
      Object.keys(markersRef.current).forEach((id) => {
        if (!currentIds.includes(Number(id))) {
          markersRef.current[id].destroy();
          delete markersRef.current[id];
        }
      });
    } catch (e) {
      toast.error("Ошибка сети при загрузке меток");
      console.error(e);
    }
  };

  const openPopup = (m) => {
  // закрываем предыдущий попап
  if (popupRef.current) {
    popupRef.current.destroy();
    popupRef.current = null;
  }

  // Проверяем, что доступно в SDK
  const PopupClass =
    window.mapgl.Balloon || window.mapgl.Popup || null;

  if (!PopupClass) {
    console.error("Popup/Balloon в 2ГИС SDK не найден");
    return;
  }

  const popup = new PopupClass(mapRef.current, {
    coordinates: [m.lng, m.lat],
    offset: [0, -30],
    closeButton: true,
    closeOnClick: true,
  });

  popup.setHTML(`
    <div style="font-size:14px; max-width:240px;">
      <p style="margin: 3px 0 8px 0; text-align: center; font-weight: bold;">
        ${m.status === "unconfirmed" ? "⚠️ Метка устарела" : "🚓 ДПС здесь"}
      </p>
      <p><b>📍 Адрес:</b> ${m.address || "Адрес не определён"}</p>
      <p><b>⏱️ Поставлена:</b> ${new Date(m.timestamp).toLocaleString()}</p>
      ${m.comment ? `<p><b>💬 Комментарий:</b> ${m.comment}</p>` : ""}
      <p><b>✅ Подтверждений:</b> ${m.confirmations || 0}</p>
      <div style="display: flex; justify-content: space-between; gap: 8px; margin-top: 8px;">
        <button id="confirm-${m.id}" style="flex:1; padding: 5px; background: #28a745; color: white; border: none; border-radius: 6px; cursor:pointer;">
          ✅ Подтвердить
        </button>
        <button id="delete-${m.id}" style="flex:1; padding: 5px; background: #dc3545; color: white; border: none; border-radius: 6px; cursor:pointer;">
          ❌ Уехали
        </button>
      </div>
    </div>
  `);

  if (popup.open) {
    popup.open(); // у Popup
  }

  popupRef.current = popup;

  // обработчики кнопок
  setTimeout(() => {
    const confirmBtn = document.getElementById(`confirm-${m.id}`);
    const deleteBtn = document.getElementById(`delete-${m.id}`);
    if (confirmBtn) confirmBtn.onclick = () => handleConfirm(m.id);
    if (deleteBtn)
      deleteBtn.onclick = () => {
        if (window.confirm("Вы уверены, что хотите удалить метку?"))
          handleDelete(m.id);
      };
  }, 0);
};

  const handleConfirm = async (id) => {
    try {
      const res = await fetch(
        `https://dps-map-rzn-h0uq.onrender.com/markers/${id}/confirm`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error("Ошибка подтверждения");
      toast.success("Метка подтверждена");
      fetchMarkers();
    } catch {
      toast.error("Ошибка при подтверждении");
    }
  };

  const handleDelete = async (id) => {
    const now = Date.now();
    if (now - lastDeleteTime < 5 * 60 * 1000) {
      toast.warn("Удалять метки можно раз в 5 минут");
      return;
    }

    try {
      const res = await fetch(
        `https://dps-map-rzn-h0uq.onrender.com/markers/${id}/delete`,
        { method: "POST" }
      );
      if (res.ok) {
        lastDeleteTime = Date.now();
        if (markersRef.current[id]) {
          markersRef.current[id].destroy();
          delete markersRef.current[id];
        }
        toast.success("Метка удалена");
      } else toast.error("Ошибка при удалении");
    } catch {
      toast.error("Ошибка при удалении");
    }
  };

  const handleMapClick = (event) => {
    const [lng, lat] = event.lngLat;
    const now = Date.now();

    if (now - lastAddTime < 5 * 60 * 1000) {
      toast.warn("Добавлять метки можно раз в 5 минут");
      return;
    }

    const confirmAdd = window.confirm(
      "Вы уверены, что хотите поставить метку здесь?"
    );
    if (!confirmAdd) return;

    let comment = "";
    const addComment = window.confirm("Добавить комментарий к метке?");
    if (addComment) comment = window.prompt("Введите комментарий к метке:") || "";

    fetch("https://dps-map-rzn-h0uq.onrender.com/markers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, comment }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Ошибка при добавлении");
        await res.json();
        lastAddTime = Date.now();
        await fetchMarkers();
        toast.success("Метка добавлена");
      })
      .catch(() => toast.error("Ошибка при добавлении метки"));
  };

  useEffect(() => {
    if (!city || !city.coords) return;

    let mapInstance;
    const BOUND_LAT_DIFF = 0.21;
    const BOUND_LNG_DIFF = 0.4;

    loadMapGL().then(() => {
      mapInstance = new window.mapgl.Map("map-2gis", {
        key: "2c1ac712-b749-4168-a3f2-d24bf6c3a7e4",
        center: [city.coords[1], city.coords[0]],
        zoom: 12,
        minZoom: 11,
        restrictArea: [
          [city.coords[1] - BOUND_LNG_DIFF, city.coords[0] - BOUND_LAT_DIFF],
          [city.coords[1] + BOUND_LNG_DIFF, city.coords[0] + BOUND_LAT_DIFF],
        ],
      });

      mapRef.current = mapInstance;
      mapInstance.on("click", handleMapClick);

      fetchMarkers();
      const interval = setInterval(fetchMarkers, 30000);
      return () => clearInterval(interval);
    });

    return () => {
      if (mapRef.current) mapRef.current.destroy();
    };
  }, [city]);

  return (
    <div
      id="map-2gis"
      style={{ width: "100%", height: "100%", position: "relative" }}
    />
  );
}
