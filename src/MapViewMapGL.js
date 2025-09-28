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
      const res = await fetch("https://dps-map-2.onrender.com/markers");
      if (!res.ok) throw new Error("Ошибка сети");
      const data = await res.json();

      data.forEach((m) => {
        const iconUrl =
          m.status === "unconfirmed"
            ? "/icons/marker-gray.png"
            : "https://cdn-icons-png.flaticon.com/128/5959/5959568.png";

        if (!markersRef.current[m.id]) {
          const marker = new window.mapgl.Marker(mapRef.current, {
            coordinates: [m.lng, m.lat],
            icon: iconUrl,
            size: [30, 30],
            anchor: [0.5, 1],
          });
          marker.on("click", () => openPopup(m, marker));
          markersRef.current[m.id] = marker;
        } else {
          markersRef.current[m.id].setIcon(iconUrl);
        }
      });

      const currentIds = data.map((m) => m.id);
      Object.keys(markersRef.current).forEach((id) => {
        if (!currentIds.includes(Number(id))) {
          if (
            popupRef.current &&
            popupRef.current.getCoordinates().toString() ===
              markersRef.current[id].getCoordinates().toString()
          ) {
            popupRef.current.getContent().style.display = "none";
            popupRef.current = null;
          }
          markersRef.current[id].destroy();
          delete markersRef.current[id];
        }
      });
    } catch (e) {
      toast.error("Ошибка сети при загрузке меток");
      console.error(e);
    }
  };

  const openPopup = (m, marker) => {
    if (popupRef.current) {
      popupRef.current.getContent().style.display = "none";
      popupRef.current = null;
    }

    const html = document.createElement("div");
    html.className = "popup";
    html.style.position = "absolute";
    html.style.width = "240px";
    html.style.background = "rgba(255, 255, 255, 0.2)";
    html.style.backdropFilter = "blur(10px)";
    html.style.border = "1px solid rgba(255,255,255,0.3)";
    html.style.padding = "10px";
    html.style.borderRadius = "10px";
    html.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
    html.style.fontSize = "14px";
    html.style.fontFamily =
      "-apple-system, BlinkMacSystemFont, 'San Francisco', Helvetica, Arial, sans-serif";
    html.style.color = "black";
    html.style.transform = "translate(-45%, -101%)";
    html.style.zIndex = "1000";
    html.style.overflow = "visible";

    html.innerHTML = `
      <button class="popup-close" style="position:absolute;top:2px;right:2px;border:none;background:transparent;font-size:16px;cursor:pointer;color:black;">×</button>
      <p class="popup-status" style="margin: 0px 0 14px 0; text-align: center; font-weight: bold; word-wrap: break-word;">
        ${m.status === "unconfirmed" ? "⚠️ Метка устарела (не подтверждена)" : "🚓 ДПС здесь"}
      </p>
      <p style="margin:2px 0; word-wrap: break-word;"><b>📍 Адрес:</b> ${m.address || "Адрес не определён"}</p>
      <p style="margin:2px 0;"><b>⏱️ Поставлена:</b> <span class="popup-time">${new Date(
        m.timestamp
      ).toLocaleString()}</span></p>
      ${
        m.comment
          ? `<p style="margin:2px 0; word-wrap: break-word;"><b>💬 Комментарий:</b> ${m.comment}</p>`
          : ""
      }
      <p style="margin:2px 0 10px 0;"><b>✅ Подтверждений:</b> <span class="popup-confirmations">${
        m.confirmations || 0
      }</span></p>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:14px;">
        <button class="confirm-btn" style="flex:1;padding:5px;background:#28a745;color:white;border:none;border-radius:6px;cursor:pointer;">✅ Подтвердить</button>
        <button class="delete-btn" style="flex:1;padding:5px;background:#dc3545;color:white;border:none;border-radius:6px;cursor:pointer;">❌ Уехали</button>
      </div>
    `;

    const popup = new window.mapgl.HtmlMarker(mapRef.current, {
      coordinates: [m.lng, m.lat],
      html,
      anchor: [0.5, 1],
    });

    popupRef.current = popup;
    const content = popup.getContent();

    content.querySelector(".popup-close").addEventListener("click", () => {
      content.style.display = "none";
      popupRef.current = null;
    });

    content.querySelector(".confirm-btn").addEventListener("click", async () => {
      try {
        const res = await fetch(
          `https://dps-map-2.onrender.com/markers/${m.id}/confirm`,
          { method: "POST", credentials: "include" }
        );
        if (!res.ok) throw new Error("Ошибка подтверждения");

        m.confirmations = (m.confirmations || 0) + 1;
        m.timestamp = Date.now();
        m.status = "confirmed";

        if (markersRef.current[m.id]) {
          markersRef.current[m.id].destroy();
          delete markersRef.current[m.id];
        }

        const newMarker = new window.mapgl.Marker(mapRef.current, {
          coordinates: [m.lng, m.lat],
          icon: "https://cdn-icons-png.flaticon.com/128/5959/5959568.png",
          size: [30, 30],
          anchor: [0.5, 1],
        });
        newMarker.on("click", () => openPopup(m, newMarker));
        markersRef.current[m.id] = newMarker;

        content.querySelector(".popup-confirmations").textContent =
          m.confirmations;
        content.querySelector(".popup-time").textContent = new Date(
          m.timestamp
        ).toLocaleString();
        content.querySelector(".popup-status").textContent = "🚓 ДПС здесь";

        toast.success("Метка подтверждена");
      } catch {
        toast.error("Ошибка при подтверждении");
      }
    });

    content.querySelector(".delete-btn").addEventListener("click", () => {
      if (window.confirm("Вы уверены, что хотите удалить метку?"))
        handleDelete(m.id);
    });

    const mapClickHandler = (ev) => {
      if (!marker.getBounds().contains(ev.lngLat)) {
        content.style.display = "none";
        popupRef.current = null;
        mapRef.current.off("click", mapClickHandler);
      }
    };
    mapRef.current.on("click", mapClickHandler);
  };

  const handleDelete = async (id) => {
    const now = Date.now();
    if (now - lastDeleteTime < 5 * 60 * 1000) {
      toast.warn("Удалять метки можно раз в 5 минут");
      return;
    }

    try {
      const res = await fetch(
        `https://dps-map-2.onrender.com/markers/${id}/delete`,
        { method: "POST" }
      );
      if (res.ok) {
        lastDeleteTime = Date.now();

        if (
          popupRef.current &&
          popupRef.current.getCoordinates().toString() ===
            markersRef.current[id].getCoordinates().toString()
        ) {
          popupRef.current.getContent().style.display = "none";
          popupRef.current = null;
        }

        if (markersRef.current[id]) {
          markersRef.current[id].destroy();
          delete markersRef.current[id];
        }
        toast.success("Метка удалена");
      } else toast.warn("Удалять метки можно раз в 5 минут");
    } catch {
      toast.warn("Удалять метки можно раз в 5 минут");
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

    fetch("https://dps-map-2.onrender.com/markers", {
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
      .catch(() => toast.warn("Добавлять метки можно раз в 5 минут"));
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
        zoomControl: false, // отключаем встроенные кнопки
        restrictArea: [
          [city.coords[1] - BOUND_LNG_DIFF, city.coords[0] - BOUND_LAT_DIFF],
          [city.coords[1] + BOUND_LNG_DIFF, city.coords[0] + BOUND_LAT_DIFF],
        ],
      });

      mapRef.current = mapInstance;
      mapInstance.on("click", handleMapClick);

      mapInstance.on("move", () => {
        const center = mapInstance.getCenter();
        let [lng, lat] = center;
        const minLng = city.coords[1] - BOUND_LNG_DIFF;
        const maxLng = city.coords[1] + BOUND_LNG_DIFF;
        const minLat = city.coords[0] - BOUND_LAT_DIFF;
        const maxLat = city.coords[0] + BOUND_LAT_DIFF;

        if (lng < minLng) lng = minLng;
        if (lng > maxLng) lng = maxLng;
        if (lat < minLat) lat = minLat;
        if (lat > maxLat) lat = maxLat;

        mapInstance.setCenter([lng, lat]);
      });

      fetchMarkers();
      const interval = setInterval(fetchMarkers, 30000);
      return () => clearInterval(interval);
    });

    return () => {
      if (mapRef.current) mapRef.current.destroy();
    };
  }, [city]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        id="map-2gis"
        style={{ width: "100%", height: "100%", position: "relative" }}
      />
      {/* Кастомные кнопки */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          right: "5px",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          zIndex: 1000,
        }}
      >
        <button
          onClick={() =>
            mapRef.current &&
            mapRef.current.setZoom(mapRef.current.getZoom() + 1)
          }
          style={zoomButtonStyle}
        >
          +
        </button>
        <button
          onClick={() =>
            mapRef.current &&
            mapRef.current.setZoom(mapRef.current.getZoom() - 1)
          }
          style={zoomButtonStyle}
        >
          -
        </button>
      </div>
    </div>
  );
}

  const zoomButtonStyle = {
    width: "36px",
    height: "36px",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    lineHeight: 1,
    borderRadius: "50%",
    background: "rgba(200, 200, 200, 0.1)",
    border: "3px solid rgba(0, 0, 0, 0.5)",
    boxShadow: "none",
    cursor: "pointer",
    fontSize: "20px",
    fontWeight: "bold",
    color: "white",
	color: "#cccccc",
    transition: "all 0.2s ease",
  };