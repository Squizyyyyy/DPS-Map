import React, { useState, useEffect } from "react";
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
  const [loadingSubscription, setLoadingSubscription] = useState(false);

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
          setHasSubscription(
            !!data.user.subscription?.expiresAt &&
              data.user.subscription.expiresAt > Date.now()
          );
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
        VKID.Config.init({
          app: 54066340,
          redirectUrl: window.location.origin,
          responseMode: VKID.ConfigResponseMode.Callback,
          source: VKID.ConfigSource.LOWCODE,
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
    script.src = "https://unpkg.com/@vkid/sdk/dist-sdk/umd/index.js";
    script.async = true;
    script.onload = init;
    script.onerror = () => setError("Не удалось загрузить SDK VKID");
    document.body.appendChild(script);
  }, []);

  // ---- Умное обновление токена через refresh token ----
  const refreshTokenIfNeeded = async () => {
    if (!user || !user.refresh_token) return;

    try {
      const VKID = window.VKIDSDK;
      const now = Math.floor(Date.now() / 1000);
      const payload = user.id_token
        ? JSON.parse(atob(user.id_token.split(".")[1]))
        : null;

      if (!payload || payload.exp - now > 300) return;

      const newTokens = await VKID.Auth.refreshToken(user.refresh_token);

      if (newTokens?.access_token) {
        const updatedUser = {
          ...user,
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || user.refresh_token,
          id_token: newTokens.id_token || user.id_token,
        };
        setUser(updatedUser);

        await fetch("/auth/vkid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            access_token: updatedUser.access_token,
            refresh_token: updatedUser.refresh_token,
            id_token: updatedUser.id_token,
          }),
        });
      }
    } catch (e) {
      console.error("Ошибка обновления токена:", e);
      setError("Не удалось обновить токен VK ID");
    }
  };

  const handleLogin = async () => {
    if (!window.VKIDSDK) {
      setError("SDK VKID не загружен");
      return;
    }
    setLoadingLogin(true);
    setError(null);

    try {
      const VKID = window.VKIDSDK;
      const { code, state, device_id } = await VKID.Auth.login();

      if (!code || !device_id) {
        setError("Не удалось получить код авторизации от VK");
        setLoadingLogin(false);
        return;
      }

      const tokenData = await VKID.Auth.exchangeCode(code, device_id);
      if (!tokenData || !tokenData.access_token) {
        setError("Не удалось обменять код на токены");
        setLoadingLogin(false);
        return;
      }

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

  const handleLogout = async () => {
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    } catch (_) {}
    setIsAuthorized(false);
    setUser(null);
    setActiveTab("account");
    setHasSubscription(false);
  };

  const handleBuySubscription = async () => {
    setLoadingSubscription(true);
    try {
      const res = await fetch("/subscription/buy", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setHasSubscription(true);
        setActiveTab("map");
      } else {
        setError(data.error || "Не удалось оформить подписку");
      }
    } catch (e) {
      console.error("Subscription buy error:", e);
      setError("Ошибка при оформлении подписки");
    } finally {
      setLoadingSubscription(false);
    }
  };

  useEffect(() => {
    if (!isAuthorized) return;
    const interval = setInterval(refreshTokenIfNeeded, 60000);
    return () => clearInterval(interval);
  }, [isAuthorized, user]);

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
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              zIndex: 9999,
            }}
          >
            <MapView />
            <button
              onClick={() => setActiveTab("account")}
              style={{
                position: "absolute",
                top: 15,
                right: 15,
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "none",
                backgroundColor: "#fff",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                cursor: "pointer",
                fontSize: 20,
                fontWeight: "bold",
                transition: "background-color 0.2s",
                zIndex: 10000,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f4f4f4")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
            >
              ←
            </button>
          </div>
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
              onClick={handleBuySubscription}
              disabled={loadingSubscription}
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
              {loadingSubscription ? "Оформляем..." : "Оформить подписку"}
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
          {activeTab === "subscription" && (
            <div>
              <h2>Подписка</h2>
              <button
                onClick={handleBuySubscription}
                disabled={loadingSubscription}
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
                {loadingSubscription ? "Оформляем..." : "Оформить подписку"}
              </button>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
