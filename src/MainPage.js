import React, { useState, useEffect, useRef } from "react";
import MapView from "./MapView";

const tabColors = {
  background: "#001c39",
  active: "#063353",
  inactive: "#0a3b66",
  text: "#fff",
};

export default function MainPage() {
  const [activeTab, setActiveTab] = useState("account");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  const vkContainerRef = useRef(null);
  const isMapActive = activeTab === "map";

  // ---- Проверяем сессию при загрузке (если уже логинился ранее) ----
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/auth/status", { credentials: "include" });
        const data = await res.json();
        if (data.authorized) {
          setUser(data.user);
          setIsAuthorized(true);
          setError(null);
        }
      } catch (e) {
        console.error("Auth status error:", e);
      }
    })();
  }, []);

  // ---------------------- Инициализация VKID ----------------------
  useEffect(() => {
    async function loadVKIDScript() {
      if (window.VKIDSDK) {
        initVKID();
      } else {
        const script = document.createElement("script");
        // важно: убрать "<" из версии пакета
        script.src = "https://unpkg.com/@vkid/sdk@3.0.0/dist-sdk/umd/index.js";
        script.async = true;
        script.onload = initVKID;
        script.onerror = () => setError("Не удалось загрузить SDK VKID");
        document.body.appendChild(script);
      }
    }

    async function initVKID() {
      if (!vkContainerRef.current || !window.VKIDSDK) return;

      const VKID = window.VKIDSDK;

      VKID.Config.init({
        app: 54066340,
        redirectUrl: window.location.origin, // держим на том же домене, где сервер
        responseMode: VKID.ConfigResponseMode.Callback,
        source: VKID.ConfigSource.LOWCODE,
        scope: "email", // просим хотя бы email, чтобы пришли базовые данные
      });

      // Вариант 1: кнопка OneTap (можешь заменить на FloatingOneTap или OAuthList — см. ниже)
      const oneTap = new VKID.OneTap();
      oneTap
        .render({
          container: vkContainerRef.current,
          showAlternativeLogin: true,
        })
        .on(VKID.WidgetEvents.ERROR, (err) => {
          console.error("VKID Widget Error:", err);
          setError("Ошибка авторизации через VK");
        })
        .on(
          VKID.OneTapInternalEvents.LOGIN_SUCCESS,
          async (payload) => {
            try {
              // Шаг 1: меняем code + device_id на токен/данные
              const data = await VKID.Auth.exchangeCode(
                payload.code,
                payload.device_id
              );

              if (!data) {
                setError("Не удалось авторизоваться через VK (пустой ответ)");
                return;
              }

              // data может НЕ содержать полностью user (зависит от scope и настроек)
              // поэтому отправляем на сервер всё, что есть: access_token и user (если есть)
              const response = await fetch("/auth/vkid", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  access_token: data.access_token || null,
                  user: data.user || null,     // может быть null — сервер сам допросит VK API
                  email: data.email || null,   // иногда приходит отдельно
                }),
              });

              const result = await response.json();
              if (result.success) {
                setUser(result.user);
                setIsAuthorized(true);
                setActiveTab("account");
                setError(null);
              } else {
                setError(result.error || "Не удалось авторизоваться через VK (сервер)");
              }
            } catch (err) {
              console.error("VKID Exchange Error:", err);
              setError("Ошибка обмена токена через VKID");
            }
          }
        );
    }

    loadVKIDScript();
  }, []);

  // ---------------------- Logout ----------------------
  const handleLogout = async () => {
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    } catch (e) {
      // игнорируем сетевую ошибку, локально чистим состояние
    }
    setIsAuthorized(false);
    setUser(null);
    setActiveTab("account");
  };

  // ---------------------- UI ----------------------
  if (!isAuthorized) {
    return (
      <div
        style={{
          height: "100vh",
          backgroundColor: tabColors.background,
          color: tabColors.text,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 16,
          textAlign: "center",
        }}
      >
        <h2>Авторизация</h2>
        <p>Чтобы пользоваться сайтом, войдите через VK ID.</p>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <div ref={vkContainerRef} style={{ marginTop: "16px" }} />
        {/* --- Если захочешь «шторку» вместо OneTap, раскомментируй блок ниже и закомментируй OneTap выше:
        
        // const floatingOneTap = new VKID.FloatingOneTap();
        // floatingOneTap.render({ appName: "DPS Map", showAlternativeLogin: true })
        //   .on(VKID.WidgetEvents.ERROR, (err) => setError("Ошибка авторизации через VK"))
        //   .on(VKID.FloatingOneTapInternalEvents.LOGIN_SUCCESS, async (payload) => { ... такой же код обмена и POST на /auth/vkid ...; floatingOneTap.close(); });

        // Или «3-в-1» (OAuthList):
        // const oAuth = new VKID.OAuthList();
        // oAuth.render({ container: vkContainerRef.current, oauthList: ["vkid"] })
        //   .on(VKID.WidgetEvents.ERROR, (err) => setError("Ошибка авторизации через VK"))
        //   .on(VKID.OAuthListInternalEvents.LOGIN_SUCCESS, async (payload) => { ... такой же код обмена и POST на /auth/vkid ... });
        
        */}
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        backgroundColor: tabColors.background,
        color: tabColors.text,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <nav
        style={{
          display: "flex",
          justifyContent: "center",
          backgroundColor: tabColors.active,
        }}
      >
        {["account", "subscription", "map"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "12px 24px",
              margin: "8px",
              backgroundColor:
                activeTab === tab ? tabColors.inactive : tabColors.active,
              border: "none",
              borderRadius: "4px",
              color: tabColors.text,
              cursor: "pointer",
              fontWeight: activeTab === tab ? "bold" : "normal",
            }}
          >
            {tab === "account" && "Профиль"}
            {tab === "subscription" && "Подписка"}
            {tab === "map" && "Карта"}
          </button>
        ))}
      </nav>

      {isMapActive ? (
        hasSubscription ? (
          <MapView />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              color: "#fff",
              padding: 16,
              textAlign: "center",
            }}
          >
            <h2>Доступ к карте ограничен</h2>
            <p>Оформите подписку, чтобы использовать карту.</p>
            <button
              onClick={() => setActiveTab("subscription")}
              style={{
                padding: "12px 24px",
                marginTop: "16px",
                backgroundColor: "#063353",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Оформить подписку
            </button>
          </div>
        )
      ) : (
        <main style={{ flex: 1, padding: "16px", overflow: "auto" }}>
          {activeTab === "account" && (
            <div>
              <h2>Добро пожаловать, {user?.info?.first_name || "гость"}!</h2>
              {user?.info?.photo_100 && (
                <img
                  src={user.info.photo_100}
                  alt="avatar"
                  style={{ width: 100, height: 100, borderRadius: "50%" }}
                />
              )}
              <p>ID пользователя: {user?.id || "—"}</p>
              <p>Email: {user?.email || "не указан"}</p>
              <button
                onClick={handleLogout}
                style={{
                  marginTop: "16px",
                  padding: "10px 20px",
                  backgroundColor: "#d9534f",
                  border: "none",
                  borderRadius: "4px",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Выйти
              </button>
            </div>
          )}
          {activeTab === "subscription" && <div>Подписка</div>}
        </main>
      )}
    </div>
  );
}
