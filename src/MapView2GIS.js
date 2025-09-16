// src/MapView2GIS.js
import React, { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

let lastAddTime = 0;
let lastDeleteTime = 0;
let currentOpenPopupMarkerId = null;

export default function MapView2GIS({ city }) {
  const mapRef = useRef(null);
  const markersRef = useRef({});

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
              ? "/icons/marker-gray.png"
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
		  popupContent.style.lineHeight = "1.4";

          const statusText =
            m.status === "unconfirmed"
              ? "⚠️ Метка устарела (не подтверждена)"
              : "🚓 ДПС здесь";

          popupContent.innerHTML = `
            <p style="margin: 3px 0 8px 0; text-align: center; font-weight: bold;">
              ${statusText}
            </p>
            <p style="margin: 3px 0;"><b>📍 Адрес:</b> ${m.address || "Адрес не определён"}</p>
            <p style="margin: 3px 0;"><b>⏱️ Поставлена:</b> ${new Date(m.timestamp).toLocaleString()}</p>
            ${m.comment ? `<p style="margin: 3px 0;"><b>💬 Комментарий:</b> ${m.comment}</p>` : ""}
            <p style="margin: 0 0 12px 0;"><b>✅ Подтверждений:</b> ${m.confirmations || 0}</p>
          `;

          // Контейнер для кнопок
          const buttonsWrapper = document.createElement("div");
          buttonsWrapper.style.display = "flex";
          buttonsWrapper.style.justifyContent = "space-between";

          // Кнопки
          const confirmBtn = document.createElement("button");
          confirmBtn.textContent = "✅ Подтвердить";
          confirmBtn.onclick = () => handleConfirm(m.id);

          const deleteBtn = document.createElement("button");
          deleteBtn.textContent = "❌ Уехали";
          deleteBtn.onclick = () => {
            const confirmDelete = window.confirm("Вы уверены, что хотите удалить метку?");
            if (confirmDelete) handleDelete(m.id);
          };

          // Добавляем кнопки в нужном порядке
          buttonsWrapper.appendChild(confirmBtn);  // слева
          buttonsWrapper.appendChild(deleteBtn);   // справа

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
              ? "/icons/marker-gray.png"
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
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка подтверждения");
      }

      // Получаем обновлённый маркер
      const allMarkersRes = await fetch("https://dps-map-rzn-h0uq.onrender.com/markers", { credentials: "include" });
      const allMarkers = await allMarkersRes.json();
      const updatedMarker = allMarkers.find((m) => m.id === id);
      if (!updatedMarker) return;

      const marker = markersRef.current[id];
      if (!marker) return;

      // Обновляем иконку
      const iconUrl =
        updatedMarker.status === "unconfirmed"
          ? "/icons/marker-gray.png"
          : "https://cdn-icons-png.flaticon.com/128/5959/5959568.png";
      marker.setIcon(
        window.DG.icon({
          iconUrl,
          iconSize: [30, 30],
          iconAnchor: [15, 30],
          popupAnchor: [0, -30],
        })
      );

      // Пересоздаём попап
      const popupContent = document.createElement("div");
      popupContent.style.lineHeight = "1.4";

      const statusText =
        updatedMarker.status === "unconfirmed"
          ? "⚠️ Метка устарела (не подтверждена)"
          : "🚓 ДПС здесь";

      popupContent.innerHTML = `
        <p style="margin: 3px 0 8px 0; text-align: center; font-weight: bold;">
          ${statusText}
        </p>
        <p style="margin: 3px 0;"><b>📍 Адрес:</b> ${updatedMarker.address || "Адрес не определён"}</p>
        <p style="margin: 3px 0;"><b>⏱️ Поставлена:</b> ${new Date(updatedMarker.timestamp).toLocaleString()}</p>
        ${updatedMarker.comment ? `<p style="margin: 3px 0;"><b>💬 Комментарий:</b> ${updatedMarker.comment}</p>` : ""}
        <p class="confirmations-count" style="margin: 0 0 12px 0;"><b>✅ Подтверждений:</b> ${updatedMarker.confirmations || 0}</p>
      `;

      const buttonsWrapper = document.createElement("div");
      buttonsWrapper.style.display = "flex";
      buttonsWrapper.style.justifyContent = "space-between";

      const confirmBtn = document.createElement("button");
      confirmBtn.textContent = "✅ Подтвердить";
      confirmBtn.onclick = () => handleConfirm(id);

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "❌ Уехали";
      deleteBtn.onclick = () => {
        if (window.confirm("Вы уверены, что хотите удалить метку?")) handleDelete(id);
      };

      buttonsWrapper.appendChild(confirmBtn);
      buttonsWrapper.appendChild(deleteBtn);
      popupContent.appendChild(buttonsWrapper);

      marker.bindPopup(popupContent).openPopup();

      toast.success("Метка подтверждена");
    } catch (err) {
      console.error(err);
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
    let observer;

    load2Gis().then(() => {
      window.DG.then(() => {
        const BOUND_LAT_DIFF = 0.21;
        const BOUND_LNG_DIFF = 0.40;
        const maxBounds = [
          [city.coords[0] - BOUND_LAT_DIFF, city.coords[1] - BOUND_LNG_DIFF],
          [city.coords[0] + BOUND_LAT_DIFF, city.coords[1] + BOUND_LNG_DIFF],
        ];

        mapInstance = window.DG.map("map-2gis", {
          center: city.coords,
          zoom: 13,
          minZoom: 11,
          maxBounds,
          maxBoundsViscosity: 1.0,
        });

        mapRef.current = mapInstance;
        mapInstance.on("click", handleMapClick);

        fetchMarkers();
        const interval = setInterval(fetchMarkers, 30000);

        // Скрываем атрибуцию 2GIS
        const styleAttribution = () => {
          const attr = document.querySelector(".dg-attribution");
          if (attr) {
            attr.style.position = "absolute";
            attr.style.bottom = "-9999px";
            attr.style.right = "-9999px";
            attr.style.fontSize = "6px";
            attr.style.opacity = "0.05";
            attr.style.pointerEvents = "none";
          }
        };

        styleAttribution();

        observer = new MutationObserver(styleAttribution);
        observer.observe(document.getElementById("map-2gis"), {
          childList: true,
          subtree: true,
        });

        return () => {
          clearInterval(interval);
          if (observer) observer.disconnect();
        };
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