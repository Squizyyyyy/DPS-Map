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
  const [sdkReady, setSdkReady] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);

  const isMapActive = activeTab === "map";

  // ---- Проверка сессии при загрузке ----
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

  // ---- Загрузка SDK VK ID ----
  useEffect(() => {
    function init() {
      try {
        const VKID = window.VKIDSDK;
        // ВАЖНО: redirectUrl ДОЛЖЕН в точности совпадать с разрешённым адресом в настройках VK ID
        VKID.Config.init({
          app: 54066340,
          redirectUrl: window.location.origin, // при проде лучше задать конкретный домен
          responseMode: VKID.ConfigResponseMode.Callback,
          source: VKID.ConfigSource.LOWCODE,
          // scopes можно не указывать — по умолчанию будет vkid.personal_info
          // Если нужны ещё данные — добавь через пробел, например: "vkid.personal_info email"
          scope: "vkid.personal_info",
        });
        setSdkReady(true);
      } catch (e) {
        console.error("VKID init error:", e);
        setError("Не удалось инициализировать VK ID");
      }
    }

    if (window.VKIDSDK) {
      init();
      return;
    }

    const script = document.createElement("script");
    // правильный URL без символа "<"
    script.src = "https://unpkg.com/@vkid/sdk/dist-sdk/umd/index.js";
    script.async = true;
    script.onload = init;
    script.onerror = () => setError("Не удалось загрузить SDK VKID");
    document.body.appendChild(script);
  }, []);

  // ---- Процесс логина строго по шагам из инструкции ----
  const handleLogin = async () => {
    if (!window.VKIDSDK) {
      setError("SDK VKID не загружен");
      return;
    }
    setLoadingLogin(true);
    setError(null);

    try {
      const VKID = window.VKIDSDK;

      // 1–11. Инициируем авторизацию: SDK сам сгенерит PKCE (code_verifier/challenge), state и scopes
      // Откроется вкладка https://id.vk.com/authorize, пользователь пройдёт аутентификацию и даст доступ
      // SDK вернёт { code, state, device_id }
      const { code, state, device_id } = await VKID.Auth.login();

      if (!code || !device_id) {
        setError("Не удалось получить код авторизации от VK");
        setLoadingLogin(false);
        return;
      }

      // 12–13. Обмен кода на токены на фронтенде
      const tokenData = await VKID.Auth.exchangeCode(code, device_id);
      // ожидаем: { access_token, refresh_token, id_token, ... }

      if (!tokenData || !tokenData.access_token) {
        setError("Не удалось обменять код на токены");
        setLoadingLogin(false);
        return;
      }

      // 14. Отправляем токены на сервер для создания сессии и сохранения пользователя в БД
      const response = await fetch("/auth/vkid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          access_token: tokenData.access_token || null,
          refresh_token: tokenData.refresh_token || null,
          id_token: tokenData.id_token || null,
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
    } catch (e) {
      console.error("VKID login error:", e);
      setError("Ошибка авторизации через VK");
    } finally {
      setLoadingLogin(false);
    }
  };

  // ---- Logout ----
  const handleLogout = async () => {
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    } catch (_) {}
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
        {error && <p style={{ color: "red", maxWidth: 520 }}>{error}</p>}
        <button
          onClick={handleLogin}
          disabled={!sdkReady || loadingLogin}
          style={{
            marginTop: 16,
            padding: "12px 24px",
            backgroundColor: sdkReady ? "#2787f5" : "#6c757d",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: sdkReady && !loadingLogin ? "pointer" : "default",
            fontWeight: 600,
          }}
        >
          {loadingLogin ? "Входим..." : "Войти через VK ID"}
        </button>

        {/* Если хочешь дополнительно оставить виджет OneTap как альтернативу —
            его можно отрендерить ниже, но по инструкции достаточно login() */}
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
