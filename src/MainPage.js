import React, { useState, useEffect } from "react";
import MapView from "./MapView";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

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
        backgroundColor: "#0a1f33",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'San Francisco', Helvetica, Arial, sans-serif",
        padding: 16,
      }}
    >
      {/* Центральный блок */}
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: "#0c274f",
          borderRadius: 24,
          padding: "24px 16px", // сделали адаптивные горизонтальные отступы
          boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          boxSizing: "border-box", // предотвращаем выход за границы
        }}
      >
        {/* Заголовок */}
        <h2 style={{
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 10,
          color: "#fff"
        }}>
          Авторизация
        </h2>

        {/* Подзаголовок */}
        <p style={{
          fontSize: 16,
          color: "#ccc",
          marginBottom: 24,
          textAlign: "center"
        }}>
          Чтобы продолжить, войдите через VK ID или Telegram
        </p>

        {/* Ошибка */}
        {error && (
          <p style={{
            color: "#ff3b30",
            marginBottom: 16,
            textAlign: "center"
          }}>
            {error}
          </p>
        )}

        {/* Блок кнопок */}
        <div
          id="auth-buttons-wrapper" //  добавил id для управления стилем
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "center",
            background: "#0a1f33",
            borderRadius: 16,
            padding: "21px 26px",
            border: "1px solid rgba(255,255,255,0.1)",
            boxSizing: "border-box",
            minWidth: 180,  //  ограничили минимальную ширину
            maxWidth: "100%", //  не вылазит за главный блок
          }}
        >
          {/* VK кнопка */}
          <button
            onClick={handleLogin}
            disabled={!sdkReady || loadingLogin}
            style={{
              width: "100%", //  растягиваем под ширину контейнера
              padding: "10px 0", //  подогнали внутренние отступы
              background: sdkReady
                ? `linear-gradient(90deg, #2787f5, #0a90ff)`
                : "#6c757d",
              color: "#fff",
              border: "none",
              borderRadius: 7,
              cursor: sdkReady && !loadingLogin ? "pointer" : "default",
              fontWeight: 600,
			  fontSize: "16px",
              transition: "all 0.2s",
            }}
          >
            {loadingLogin ? "Входим..." : "Войти через VK ID"}
          </button>

          {/* Telegram кнопка */}
          <div
            id="telegram-button-container"
            style={{
              display: "flex",
              justifyContent: "center",
              width: "100%", // кнопка тг управляет шириной контейнера
            }}
          />
        </div>
		
		{/* Блок контактов поддержки */}
        <div
          style={{
            marginTop: 24,           // расстояние от блока кнопок
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,                  // расстояние между текстом и иконкой
            color: "#ccc",
            fontSize: 14,
          }}
        >
          <span>Есть вопрос?</span>
          <a
            href="https://t.me/dps_map_support"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              color: "#00aaff",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 240 240"
              width="20"
              height="20"
              fill="currentColor"
            >
              <path d="M120 0C53.7 0 0 53.7 0 120s53.7 120 120 120 120-53.7 120-120S186.3 0 120 0zm57.1 82.8l-16.9 79.9c-1.3 5.7-4.7 7-9.5 4.3l-26.2-19.3-12.7 12.2c-1.4 1.4-2.5 2.5-5.1 2.5l1.8-25.1 45.7-41c2-1.8-0.4-2.8-3.1-1l-56.4 35.5-24.3-7.6c-5.3-1.6-5.4-5.3 1.1-7.8l94.9-36.6c4.4-1.5 8.2 1 6.8 7.4z"/>
            </svg>
          </a>
        </div>
		
      </div>
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
      <nav
        style={{
          display: "flex",
          justifyContent: "center",
          backgroundColor: tabColors.active,
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          width: "100%",
          borderBottomLeftRadius: "16px",
          borderBottomRightRadius: "16px",
          overflow: "hidden", // чтобы скругление работало
        }}
      >
        {/* панель поделена на 3 равные зоны */}
        {["account", "subscription", "map"].map((tab) => (
          <div
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, // равная ширина
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "14px 0",
              background:
                activeTab === tab
                  ? `linear-gradient(135deg, #2787f5, #1449a3)`
                  : tabColors.inactive,
              color: tabColors.text,
              cursor: "pointer",
              fontWeight: activeTab === tab ? "700" : "500",
              fontSize: activeTab === tab ? "16px" : "15px",
              transform: activeTab === tab ? "scale(1.07)" : "scale(1)",
              transition: "all 0.08s ease",
			  fontFamily:
			    "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Helvetica Neue', Helvetica, Arial, sans-serif",
            }}
          >
            {tab === "account" && "Профиль"}
            {tab === "subscription" && "Подписка"}
            {tab === "map" && "Карта"}
          </div>
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
        )
      ) : (
        <main style={{ flex: 1, padding: "16px", overflow: "auto" }}>
          {activeTab === "account" && (
  <div style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
	gap: 16,
    padding: "0 30px",
	maxWidth: 500,
	margin: "0 auto",
	marginTop: "30px",
	fontFamily: "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Helvetica Neue', Helvetica, Arial, sans-serif"
  }}>

    {/* ---- Профиль ---- */}
    <div style={{
      backgroundColor: "#0a1f33",
	  borderRadius: 16,
      padding: 16,
      width: "100%",
	  maxWidth: 300,
	  textAlign: "center",
	  boxShadow: "0 8px 20px rgba(0,0,0,0.15)"
    }}>
	  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff" }}>Профиль</h2>
      <p style={{ color: "#aaa", fontSize: 16, marginTop: 8 }}>
        <b>ID пользователя:</b> {user?.id || "—"}
      </p>
    </div>

    {/* ---- Выбор города ---- */}
    <div style={{
      backgroundColor: "#0a1f33",
	  borderRadius: 16,
      padding: 16,
      width: "100%",
	  maxWidth: 300,
	  textAlign: "center",
	  boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
      display: "flex",
      flexDirection: "column",
	  gap: 12
    }}>
	  <label style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Ваш город</label>
      <select
        value={selectedCity.name}
        onChange={(e) => {
          const city = cities.find((c) => c.name === e.target.value);
          if (city) setSelectedCity(city);
        }}
        style={{
		  padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #1f3a5f",
          backgroundColor: "#063353",
          color: "#fff",
		  fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          width: "100%",
          appearance: "none",
		}}
      >
        {cities.map((city) => (
          <option key={city.name} value={city.name}>{city.name}</option>
        ))}
      </select>
	  <p style={{ color: "#aaa", fontSize: 14, margin: 0 }}>
        Выбран город: <b>{selectedCity.name}</b>
      </p>
      <button
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
        style={{
		  padding: "10px 0",
          background: "linear-gradient(90deg, #2787f5, #0a90ff)",
          color: "#fff",
          border: "none",
		  borderRadius: 10,
          cursor: "pointer",
          fontWeight: 600,
		  fontSize: 14,
          width: "100%",
		  transition: "all 0.2s"
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "linear-gradient(90deg, #1e6cd8, #0470ff)")}
		onMouseLeave={(e) => (e.currentTarget.style.background = "linear-gradient(90deg, #2787f5, #0a90ff)")}
      >
        Сохранить
      </button>
    </div>

    {/* ---- Выйти ---- */}
    <button
      onClick={handleLogout}
      style={{
		padding: "12px 0",
        background: "#d9534f",
        border: "none",
		borderRadius: 10,
        color: "#fff",
        cursor: "pointer",
        fontWeight: 700,
		fontSize: 14,
        width: "100%",
		maxWidth: 300,
        transition: "all 0.2s",
		marginTop: 90,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#c9302c")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#d9534f")}
    >
      Выйти из профиля
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
        </main>
      )}
    </div>
   );
}