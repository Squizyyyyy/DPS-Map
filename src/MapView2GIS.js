// src/MapView2GIS.js
import React, { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

let lastAddTime = 0;
let lastDeleteTime = 0;
let currentOpenPopupMarkerId = null;

export default function MapView2GIS({ city }) {
  const mapRef = useRef(null);
  const markersRef = useRef({}); // храним маркеры по id

  // --- Загрузка SDK 2ГИС ---
  const load2Gis = () =>
    new Promise((resolve, reject) => {
      if (window.DG) return resolve(window.DG);

      const script = document.createElement("script");
      script.src = "https://maps.api.2gis.ru/2.0/loader.js?pkg=full";
      script.async = true;
      script.onload = () => resolve(window.DG);
      script.onerror = () => reject(new Error("Не удалось загрузить 2ГИС SDK"));
      document.body.appendChild(script);
    });

  // --- Загрузка маркеров ---
  const fetchMarkers = async () => {
    try {
      const res = await fetch("https://dps-map-rzn-h0uq.onrender.com/markers");
      if (!res.ok) throw new Error("Ошибка сети");
      const data = await res.json();

      // Добавляем/обновляем маркеры
      data.forEach((m) => {
        if (!markersRef.current[m.id]) {
          // создаём новый маркер
          const iconUrl =
            m.status === "unconfirmed"
              ? "https://cdn-icons-png.flaticon.com/128/5959/5959568.png"
              : "https://cdn-icons-png.flaticon.com/128/5959/5959568.png";

          const icon = window.DG.icon({
            iconUrl,
            iconSize: [30, 30],
            iconAnchor: [15, 30],
			popupAnchor: [0, -30],
          });

          const marker = window.DG
            .marker([m.lat, m.lng], { 
              icon,
              zIndexOffset: 1000
            }).addTo(mapRef.current);

          // Попап
          const popupContent = document.createElement("div");

          const statusText =
            m.status === "unconfirmed"
              ? "⚠️ Метка устарела (не подтверждена)"
              : "🚓 ДПС здесь";

          popupContent.innerHTML = `
            <p style="margin: 2px 0;">${statusText}</p>
            <p style="margin: 2px 0;"><b>📍 Адрес:</b> ${m.address || "Адрес не определён"}</p>
            <p style="margin: 2px 0;"><b>⏱️ Поставлена:</b> ${new Date(m.timestamp).toLocaleString()}</p>
            ${m.comment ? `<p style="margin: 2px 0;"><b>💬 Комментарий:</b> ${m.comment}</p>` : ""}
            <p style="margin: 2px 0;"><b>✅ Подтверждений:</b> ${m.confirmations || 0}</p>
          `;

          // Кнопки подтверждения и удаления
          const buttonsWrapper = document.createElement("div");
          buttonsWrapper.style.display = "flex";
          buttonsWrapper.style.justifyContent = "space-between";
          buttonsWrapper.style.marginTop = "6px"; // небольшой отступ сверху

          const confirmBtn = document.createElement("button");
          confirmBtn.textContent = "✅ Подтвердить";
          confirmBtn.onclick = () => handleConfirm(m.id);

          const deleteBtn = document.createElement("button");
          deleteBtn.textContent = "❌ Уехали";
          deleteBtn.onclick = () => {
            const confirmDelete = window.confirm("Вы уверены, что хотите удалить метку?");
            if (confirmDelete) handleDelete(m.id);
          };

          buttonsWrapper.appendChild(deleteBtn);   // слева
          buttonsWrapper.appendChild(confirmBtn);  // справа

          popupContent.appendChild(buttonsWrapper);

          marker.bindPopup(popupContent);
		  
		  marker.on("popupopen", () => {
            currentOpenPopupMarkerId = m.id;
            marker.setZIndexOffset(10000);
			
			// Через 50мс восстанавливаем иконку
            setTimeout(() => {
              marker.setIcon(
                window.DG.icon({
                  iconUrl,
                  iconSize: [30, 30],
                  iconAnchor: [15, 30],
				  popupAnchor: [0, -30],
                })
              );
            }, 0);
          });
          marker.on("popupclose", () => {
            currentOpenPopupMarkerId = null;
            marker.setZIndexOffset(1000);
          });

          markersRef.current[m.id] = marker;
        } else {
		  if (currentOpenPopupMarkerId === m.id) return;
          // обновляем иконку существующего маркера
          const existingMarker = markersRef.current[m.id];
          const iconUrl =
            m.status === "unconfirmed"
              ? "https://cdn-icons-png.flaticon.com/128/5959/5959568.png"
              : "https://cdn-icons-png.flaticon.com/128/5959/5959568.png";
          existingMarker.setIcon(
            window.DG.icon({
              iconUrl,
              iconSize: [30, 30],
              iconAnchor: [15, 30],
            })
          );
        }
      });

      // Удаляем маркеры, которых нет на сервере
      const currentIds = data.map((m) => m.id);
      Object.keys(markersRef.current).forEach((id) => {
        if (!currentIds.includes(Number(id))) {
          mapRef.current.removeLayer(markersRef.current[id]);
          delete markersRef.current[id];
        }
      });
    } catch (e) {
      toast.error("Ошибка сети при загрузке меток");
      console.error(e);
    }
  };

  // --- Подтверждение ---
  const handleConfirm = async (id) => {
    try {
      const res = await fetch(
        `https://dps-map-rzn-h0uq.onrender.com/markers/${id}/confirm`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Ошибка подтверждения");
      await fetchMarkers();
      toast.success("Метка подтверждена");
    } catch {
      toast.error("Ошибка при подтверждении");
    }
  };

  // --- Удаление ---
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
      if (res.status === 429) {
        toast.warn("Удалять метки можно раз в 5 минут");
      } else if (res.ok) {
        lastDeleteTime = Date.now();
        if (markersRef.current[id]) {
          mapRef.current.removeLayer(markersRef.current[id]);
          delete markersRef.current[id];
        }
        toast.success("Метка удалена");
      } else {
        toast.error("Ошибка при удалении");
      }
    } catch {
      toast.error("Ошибка при удалении");
    }
  };

  // --- Клик по карте (добавление) ---
  const handleMapClick = (e) => {
    const { lat, lng } = e.latlng;
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
        if (res.status === 429) {
          toast.warn("Добавлять метки можно раз в 5 минут");
          return;
        }
        if (!res.ok) throw new Error("Ошибка при добавлении");
        await res.json();
        lastAddTime = Date.now();
        await fetchMarkers();
        toast.success("Метка добавлена");
      })
      .catch(() => toast.error("Ошибка при добавлении метки"));
  };

  // --- Инициализация карты ---
  useEffect(() => {
    if (!city || !city.coords) return;

    let mapInstance;

    load2Gis().then(() => {
      window.DG.then(() => {
        mapInstance = window.DG.map("map-2gis", {
          center: city.coords,
          zoom: 13,
        });

        mapRef.current = mapInstance;

        mapInstance.on("click", handleMapClick);

        fetchMarkers();
        const interval = setInterval(fetchMarkers, 30000);
        return () => clearInterval(interval);
      });
    });

    return () => {
      if (mapInstance) {
        mapInstance.remove();
      }
    };
  }, [city]);

  return (
    <div
      id="map-2gis"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        zIndex: 0,
      }}
    />
  );
}
