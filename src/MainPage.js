import React, { useState, useEffect } from "react";
import MapView from "./MapView";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./MainPage.css";

const tabColors = {
  background: "#001c39",
  active: "#063353",
  inactive: "#0a3b66",
  text: "#fff",
  highlight: "#2787f5",
};

const cities = [
  { name: "Рязань", coords: [54.6296, 39.7412] },
  { name: "Тула", coords: [54.1920, 37.6156] },
  { name: "Липецк", coords: [52.6106, 39.5946] },
  { name: "Тамбов", coords: [52.7216, 41.4523] },
];

export default function MainPage() {
  const [activeTab, setActiveTab] = useState("account");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [selectedCity, setSelectedCity] = useState(cities[0]);

  const isMapActive = activeTab === "map";

  // Проверка сессии при загрузке
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

          if (data.user.city) {
            const city = cities.find((c) => c.name === data.user.city);
            if (city) setSelectedCity(city);
          }
        }
      } catch (e) {
        console.error("Auth status error:", e);
      }
    })();
  }, []);

  // Загрузка SDK VK ID
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

        if (result.user.city) {
          const city = cities.find((c) => c.name === result.user.city);
          if (city) setSelectedCity(city);
        }
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
  
  // ---- Telegram JS-виджет ----
  const handleTelegramLogin = async (telegramData) => {
	setLoadingLogin(true);
	setError(null);
	try {
	  const res = await fetch("/auth/telegram", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify(telegramData),
	  });
	  const data = await res.json();
	  if (data.success) {
	    setUser(data.user);
		setIsAuthorized(true);
		setActiveTab("account");
		setError(null);
		if (data.user.city) {
		  const city = cities.find((c) => c.name === data.user.city);
		  if (city) setSelectedCity(city);
		}
	  } else {
		setError(data.error || "Не удалось авторизоваться через Telegram");
	  }
	} catch (e) {
	  console.error("Telegram login error:", e);
	  setError("Ошибка авторизации через Telegram");
	} finally {
	  setLoadingLogin(false);
	}
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

  useEffect(() => {
    if (!isAuthorized) return;
    const interval = setInterval(refreshTokenIfNeeded, 60000);
    return () => clearInterval(interval);
  }, [isAuthorized, user]);
  
  // ---- Подключение Telegram JS-виджета ----
  useEffect(() => {
	window.handleTelegramAuth = (user) => handleTelegramLogin(user);
	
	const container = document.getElementById("telegram-button-container");
	if (!container) return;
	
	container.innerHTML = "";
	
	if (!isAuthorized) {
	  const script = document.createElement("script");
	  script.src = "https://telegram.org/js/telegram-widget.js?15";
      script.setAttribute("data-telegram-login", process.env.REACT_APP_TELEGRAM_BOT_USERNAME);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-userpic", "false");
      script.setAttribute("data-radius", "8");
      script.setAttribute("data-request-access", "write");
      script.setAttribute("data-onauth", "handleTelegramAuth(user)");
	  script.async = true;
	  
	  container.appendChild(script);
	}
  }, [isAuthorized]);

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
        <p>Чтобы воспользоваться DPS Map, войдите через VK ID или Telegram.</p>
        {error && <p style={{ color: "red", maxWidth: 520 }}>{error}</p>}
        <button
          onClick={handleLogin}
          disabled={!sdkReady || loadingLogin}
          style={{
            marginTop: 16,
            padding: "12px 24px",
            background: sdkReady
              ? `linear-gradient(90deg, #2787f5, #0a90ff)`
              : "#6c757d",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: sdkReady && !loadingLogin ? "pointer" : "default",
            fontWeight: 600,
            transition: "all 0.2s",
          }}
        >
          {loadingLogin ? "Входим..." : "Войти через VK ID"}
        </button>
		
		{/* Telegram */}
		<div id="telegram-button-container" style={{ marginTop: 16 }} />
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
    <ToastContainer position="bottom-right" autoClose={3000} />

    {/* Навигация */}
    <nav
      style={{
        display: "flex",
        justifyContent: "center",
        backgroundColor: tabColors.active,
        padding: "8px 0",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      {["account", "subscription", "map"].map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          style={{
            padding: "12px 28px",
            margin: "0 8px",
            background:
              activeTab === tab
                ? `linear-gradient(135deg, #2787f5, #0a90ff)`
                : tabColors.inactive,
            border: "none",
            borderRadius: "8px",
            color: tabColors.text,
            cursor: "pointer",
            fontWeight: activeTab === tab ? "700" : "500",
            boxShadow:
              activeTab === tab
                ? "0 4px 12px rgba(0,0,0,0.4)"
                : "0 2px 4px rgba(0,0,0,0.2)",
            transition: "all 0.3s",
          }}
          onMouseEnter={(e) => {
            if (activeTab !== tab) e.currentTarget.style.background = "#0d4c82";
          }}
          onMouseLeave={(e) => {
            if (activeTab !== tab) e.currentTarget.style.background = tabColors.inactive;
          }}
        >
          {tab === "account" && "Профиль"}
          {tab === "subscription" && "Подписка"}
          {tab === "map" && "Карта"}
        </button>
      ))}
    </nav>

    {/* Контент */}
    <main className="main-content" style={{ flex: 1, overflow: "auto" }}>
      {/* Вкладка: Профиль */}
      {activeTab === "account" && (
        <div className="profile-container">
          {/* Профиль */}
          <div className="card">
            <h2 className="card-title">Профиль</h2>
            <p className="card-text">
              <b>ID пользователя:</b> {user?.id || "—"}
            </p>
          </div>

          {/* Выбор города */}
          <div className="card">
            <label className="label">Ваш город</label>
            <select
              className="select"
              value={selectedCity.name}
              onChange={(e) => {
                const city = cities.find((c) => c.name === e.target.value);
                if (city) setSelectedCity(city);
              }}
            >
              {cities.map((city) => (
                <option key={city.name} value={city.name}>
                  {city.name}
                </option>
              ))}
            </select>
            <p className="card-subtext">
              Выбран город: <b>{selectedCity.name}</b>
            </p>
            <button
              className="btn-primary"
              onClick={async () => {
                try {
                  const res = await fetch("/auth/set-city", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ city: selectedCity.name }),
                  });
                  const data = await res.json();
                  if (data.success) toast.success("Город сохранён");
                  else toast.error(data.error || "Не удалось сохранить город");
                } catch (e) {
                  console.error("Ошибка при сохранении города:", e);
                  toast.error("Ошибка сети при сохранении города");
                }
              }}
            >
              Сохранить
            </button>
          </div>

          {/* Выйти */}
          <button className="btn-logout" onClick={handleLogout}>
            Выйти из профиля
          </button>
        </div>
      )}

      {/* Вкладка: Подписка */}
      {activeTab === "subscription" && (
        <div className="subscription-container">
          <h2>Подписка</h2>
          <button
            onClick={handleBuySubscription}
            disabled={loadingSubscription}
            style={{
              padding: "12px 24px",
              marginTop: "16px",
              background: `linear-gradient(90deg, #2787f5, #0a90ff)`,
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
              transition: "all 0.2s",
            }}
          >
            {loadingSubscription ? "Оформляем..." : "Оформить подписку"}
          </button>
        </div>
      )}

      {/* Вкладка: Карта */}
      {isMapActive && (
        <>
          {hasSubscription ? (
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
              <MapView city={selectedCity} />
              <button
                onClick={() => setActiveTab("account")}
                style={{
                  position: "absolute",
                  top: 9,
                  right: 10,
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
                  color: "black",
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
                  background: `linear-gradient(90deg, #2787f5, #0a90ff)`,
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}
              >
                {loadingSubscription ? "Оформляем..." : "Оформить подписку"}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  </div>
);
