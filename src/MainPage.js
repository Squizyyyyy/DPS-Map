import React, { useState, useEffect } from "react";
import MapViewMapGL from "./MapViewMapGL";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ReactComponent as AccountIcon } from "./assets/icons/account.svg";
import { ReactComponent as SubscriptionIcon } from "./assets/icons/sub.svg";
import { ReactComponent as MapIcon } from "./assets/icons/map.svg";
import { ReactComponent as WhatsAppIcon } from './assets/icons/wa.svg';

const tabColors = {
  background: "#001c39",
  active: "#063353",
  inactive: "#0a3b66",
  text: "#fff",
  highlight: "#2787f5",
};

const cities = [
  { name: "Не выбран", coords: null},
  { name: "Рязань", coords: [54.6296, 39.7412] },
  // { name: "Тула", coords: [54.1920, 37.6156] },
  // { name: "Липецк", coords: [52.6106, 39.5946] },
  // { name: "Тамбов", coords: [52.7216, 41.4523] },
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
  
  // Убираем стандартные отступы body/html
  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.documentElement.style.margin = "0";
    document.documentElement.style.padding = "0";
    document.body.style.height = "100%";
    document.documentElement.style.height = "100%";
  }, []);

  // Проверка сессии при загрузке
useEffect(() => {
  (async () => {
    try {
      const res = await fetch("/auth/status", { credentials: "include" });
      const data = await res.json();

      if (data.authorized) {
        const userData = data.user;

        setUser(userData);
        setIsAuthorized(true);

        // Подтягиваем подписку
        setHasSubscription(
          userData.subscription?.expiresAt
            ? userData.subscription.expiresAt > Date.now()
            : false
        );

        // Подтягиваем город
        if (userData.city) {
          const city = cities.find((c) => c.name === userData.city);
          if (city) setSelectedCity(city);
        }

        setError(null);
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
      const userData = result.user;

      setUser(userData);
      setIsAuthorized(true);

      // Подтягиваем подписку
      setHasSubscription(
        userData.subscription?.expiresAt
          ? userData.subscription.expiresAt > Date.now()
          : false
      );

      // Подтягиваем город
      if (userData.city) {
        const city = cities.find((c) => c.name === userData.city);
        if (city) setSelectedCity(city);
      }

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
  
  // Telegram JS-виджет
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
      const userData = data.user;

      setUser(userData);
      setIsAuthorized(true);

      // Подтягиваем подписку
      setHasSubscription(
        userData.subscription?.expiresAt
          ? userData.subscription.expiresAt > Date.now()
          : false
      );

      // Подтягиваем город
      if (userData.city) {
        const city = cities.find((c) => c.name === userData.city);
        if (city) setSelectedCity(city);
      }

      setActiveTab("account");
      setError(null);
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
  
  // Подключение Telegram JS-виджета
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
		boxSizing: "border-box",
      }}
    >
      {/* Центральный блок */}
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: "#0c274f",
          borderRadius: 24,
          padding: "24px 16px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          boxSizing: "border-box",
        }}
      >
        {/* Заголовок */}
        <h2 style={{
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 30,
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
          id="auth-buttons-wrapper"
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
            minWidth: 180,
            maxWidth: "100%",
          }}
        >
          {/* VK кнопка */}
          <button
            onClick={handleLogin}
            disabled={!sdkReady || loadingLogin}
            style={{
              width: "100%",
			  height: 40,
              padding: "10px 0",
              background: sdkReady
                ? `linear-gradient(90deg, #2787f5, #0a90ff)`
                : "#6c757d",
              color: "#fff",
              border: "none",
              borderRadius: 7,
              cursor: sdkReady && !loadingLogin ? "pointer" : "default",
			  fontWeight: 500,
			  fontSize: "16px",
              transition: "all 0.2s",
			  display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 13,
            }}
          >
		    {/* Иконка ВК */}
            <img
              src="/icons/vk.png"
              alt="VK"
              style={{ width: 23, height: 15, marginLeft: 14 }}
            />
            {loadingLogin ? "Входим..." : "Войти через VK ID"}
          </button>

          {/* Telegram кнопка */}
          <div
            id="telegram-button-container"
            style={{
              display: "flex",
              justifyContent: "center",
              width: "100%",
            }}
          />
        </div>
		
		{/* Блок контактов поддержки */}
        <div
          style={{
            marginTop: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
			textDecoration: "underline",
            gap: 8,
            color: "#ccc",
            fontSize: 14,
          }}
        >
          <span>Есть вопрос?</span>
		  
		  {/* Telegram */}
          <a
            href="https://t.me/dps_map_support"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 240 240"
              width="21"
              height="21"
              fill="currentColor"
            >
              <path d="M120 0C53.7 0 0 53.7 0 120s53.7 120 120 120 120-53.7 120-120S186.3 0 120 0zm57.1 82.8l-16.9 79.9c-1.3 5.7-4.7 7-9.5 4.3l-26.2-19.3-12.7 12.2c-1.4 1.4-2.5 2.5-5.1 2.5l1.8-25.1 45.7-41c2-1.8-0.4-2.8-3.1-1l-56.4 35.5-24.3-7.6c-5.3-1.6-5.4-5.3 1.1-7.8l94.9-36.6c4.4-1.5 8.2 1 6.8 7.4z"/>
            </svg>
		  </a>
			
			{/* WhatsApp */}
            <a
              href="https://wa.me/+79958962951"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <WhatsAppIcon
                width={21}
                height={21}
                style={{
                cursor: "pointer",
				fill: "currentColor",
                }}
              />
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

{/* Нижняя панель вкладок */}
{activeTab !== "guide" && (
<nav
  style={{
    position: "fixed",
    bottom: 0,
    left: 0,
    width: "100%",
    display: "flex",
    justifyContent: "space-around",
    backgroundColor: tabColors.background,
    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
    boxShadow: "none",
    zIndex: 1000,
	paddingTop: 6.5,
	paddingBottom: 35,
  }}
>
  {[
    { key: "account", Icon: AccountIcon, label: "Профиль" },
    { key: "subscription", Icon: SubscriptionIcon, label: "Подписка" },
    { key: "map", Icon: MapIcon, label: "Карта" },
  ].map(({ key, Icon, label }) => (
    <div
      key={key}
      onClick={() => setActiveTab(key)}
      style={{
        flex: 1,
        display: "flex",
		flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        cursor: "pointer",
        padding: "0px 0",
        transition: "all 0.15s ease",
      }}
    >
      <Icon
        style={{
          width: 26,
          height: 26,
          color: activeTab === key ? "#2787f5" : "#fff",
          transition: "color 0.15s ease",
        }}
		strokeWidth={1.5}
      />
	  <span
        style={{
          fontSize: 11,
          marginTop: 2,
          color: activeTab === key ? "#2787f5" : "#fff",
		  fontFamily: "-apple-system, BlinkMacSystemFont, 'San Francisco', Helvetica, Arial, sans-serif",
          transition: "color 0.15s ease",
        }}
      >
        {label}
      </span>
    </div>
  ))}
</nav>
)}

{isMapActive ? (
  hasSubscription ? (
    selectedCity.name === "Не выбран" ? (
      <div
        style={{
		  height: "calc(100vh - 80px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
		  flexDirection: "column",
          padding: 24,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'San Francisco', Helvetica, Arial, sans-serif",
          color: "#fff",
          textAlign: "center",
          backgroundColor: tabColors.background,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 360,
            padding: 24,
            borderRadius: 24,
            border: "2px solid rgba(255, 255, 255, 0.3)",
            backgroundColor: "transparent",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            Выберите город
          </h2>

          <p style={{ fontSize: 16, color: "#ccc", margin: 0 }}>
            Карта будет доступна после выбора города во вкладке Профиль.
          </p>
        </div>
      </div>
    ) : (
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
        <MapViewMapGL city={selectedCity} />
        <button
          onClick={() => setActiveTab("account")}
          style={{
            position: "absolute",
            top: 5,
            right: 5,
            width: 42,
            height: 42,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            lineHeight: 1,
            borderRadius: "50%",
            background: "rgba(64, 64, 64, 0.15)",
            border: "3px solid rgba(0, 0, 0, 0.5)",
            boxShadow: "none",
            cursor: "pointer",
            fontSize: 20,
            fontWeight: "bold",
            color: "white",
            transition: "all 0.2s ease",
            zIndex: 10000,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0, 0, 0, 0.35)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0, 0, 0, 0.15)")}
        >
          ←
        </button>
      </div>
    )
  ) : (
    <div
      style={{
        height: "calc(100vh - 80px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        padding: 24,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'San Francisco', Helvetica, Arial, sans-serif",
        textAlign: "center",
        backgroundColor: tabColors.background,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          padding: 24,
          borderRadius: 24,
          border: "2px solid rgba(255, 255, 255, 0.3)",
          backgroundColor: "transparent",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#fff" }}>
          Доступ к карте ограничен
        </h2>

        <p style={{ fontSize: 16, color: "#ccc", margin: 0 }}>
          Чтобы использовать карту, активируйте подписку во вкладке Подписка.
        </p>
      </div>
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


    {/* Профиль */}
    <div style={{
      backgroundColor: "#0a1f33",
	  borderRadius: 24,
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

    {/* Выбор города */}
    <div style={{
      backgroundColor: "#0a1f33",
	  borderRadius: 24,
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
          borderRadius: 16,
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
		  borderRadius: 16,
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

    {/* Выйти */}
    <button
      onClick={handleLogout}
      style={{
		padding: "12px 0",
        background: "#d9534f",
        border: "none",
		borderRadius: 16,
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

  {/* О нас и Связь с нами */}
  <div
    style={{
      marginTop: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      color: "#aaa",
      fontSize: 14,
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'San Francisco', Helvetica, Arial, sans-serif",
    }}
  >
    {/* О нас */}
    <span
      onClick={() => setActiveTab("guide")}
      style={{
        cursor: "pointer",
        textDecoration: "underline",
      }}
    >
      О нас
    </span>

    {/* Разделитель */}
    <span>|</span>

    {/* Связь с нами */}
    <span style={{ textDecoration: "underline" }}>Связь с нами:</span>

    {/* Telegram */}
    <a
      href="https://t.me/dps_map_support"
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "center", color: "inherit" }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 240 240"
        width="21"
        height="21"
        fill="currentColor"
      >
        <path d="M120 0C53.7 0 0 53.7 0 120s53.7 120 120 120 120-53.7 120-120S186.3 0 120 0zm57.1 82.8l-16.9 79.9c-1.3 5.7-4.7 7-9.5 4.3l-26.2-19.3-12.7 12.2c-1.4 1.4-2.5 2.5-5.1 2.5l1.8-25.1 45.7-41c2-1.8-0.4-2.8-3.1-1l-56.4 35.5-24.3-7.6c-5.3-1.6-5.4-5.3 1.1-7.8l94.9-36.6c4.4-1.5 8.2 1 6.8 7.4z"/>
      </svg>
    </a>

    {/* WhatsApp */}
    <a
      href="https://wa.me/+79958962951"
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "center", color: "inherit" }}
    >
      <WhatsAppIcon
        width={21}
        height={21}
        style={{ cursor: "pointer", fill: "currentColor" }}
      />
    </a>
  </div>
</div>
)}

{/* Вкладка Гайд */}
{activeTab === "guide" && (
  <div style={{ 
    position: "relative",
    padding: 16,
    paddingTop: "76px",
    maxWidth: 500,
	margin: "0 auto",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'San Francisco', Helvetica, Arial, sans-serif",
    color: "#fff"
  }}>
    
    {/* Кнопка назад */}
    <button
      onClick={() => setActiveTab("account")}
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        background: "rgba(20,40,60,0.4)",
        border: "none",
        borderRadius: 12,
        padding: "8px 12px",
        color: "#fff",
        fontWeight: 700,
        fontSize: 14,
        cursor: "pointer",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        zIndex: 1000
      }}
    >
      ← Вернуться назад
    </button>

    {/* Аккордеоны */}
    {[
      {
        title: "Карта",
        content: (
          <>
            <p>В данном приложении используется детализированная 3D карта от 2GIS, чтобы пользование было максимально приятным.</p>
            <p>Пользователь может увеличивать масштаб карты, уменьшать масштаб карты, а также менять угол наклона путём одновременного проведения двумя пальцами по экрану вверх и вниз.</p>
          </>
        )
      },
      {
        title: "Клик по карте",
        content: (
          <p>Нажав на любую область карты, пользователь на экране увидит окошко с подтверждением действия, чтобы избежать случайного нажатия при изменении масштаба карты.</p>
        )
      },
      {
        title: "Маркер",
        content: (
          <>
            <p>Маркер (или же метка) имеет 2 состояния:</p>
            <p>• Цветное — метка актуальна.</p>
            <p>• Чёрнобелое — метка устарела.</p>
            <p>Что это значит? У каждой метки есть время жизни, которое составляет 1 час 30 минут. Спустя 1 час с момента как метка была поставлена, она становится чёрнобелой, что свидетельствует о том, что метка может быть уже не актуальной. Оставшиеся 30 минут метка проживёт в чёрнобелом состоянии, после чего исчезнет автоматически навсегда, если её не подтвердить (см. пункт "Подтверждение").</p>
          </>
        )
      },
      {
        title: "Попап",
        content: (
          <>
            <p>Попап (или же блок с информацией о метке) присваивается к каждой метке и содержит некую информацию о ней:</p>
            <p>• Адрес метки;</p>
            <p>• Время, в которое метка поставлена;</p>
            <p>• Комментарий к метке (если есть);</p>
            <p>• Количество подтверждений;</p>
            <p>• Две кнопки "Подтвердить", "Уехали".</p>
            <p>Открыть попап можно кликнув один раз по самой метке.</p>
            <p>Закрыть попап можно нажав на крестик в верхнем правом углу.</p>
          </>
        )
      },
      {
        title: "Комментарий",
        content: (
          <p>Пользователь может добавить комментарий к своей метке. После клика по карте и подтверждения действия, пользователю будет предложено добавить комментарий, что является необязательным.</p>
        )
      },
      {
        title: "Подтверждение",
        content: (
          <>
            <p>В попапе метки есть кнопка "Подтвердить". Кнопка выполняет следующие функции:</p>
            <p>• Если метка чёрнобелая — меняет цвет обратно;</p>
            <p>• Время, в которое метка была поставлена — обновляется. Теперь в попапе отображается новое время (то, в которое метка была подтверждена);</p>
            <p>• Время жизни метки также обновляется — метка снова живёт 1 ч. 30 мин.;</p>
            <p>• Количество подтверждений увеличивается.</p>
            <p>Обратите внимание! Данная кнопка может использоваться если метка ещё не изменила цвет. В таком случае изменится также количество подтверждений, время, в которое метка была поставлена и таймер "жизни" метки начнёт отсчёт заново.</p>
          </>
        )
      },
      {
        title: "Удаление",
        content: (
          <p>В попапе также находится кнопка "Уехали", которая выполняет функцию досрочного удаления метки с карты.</p>
        )
      },
      {
        title: "Ограничения",
        content: (
          <>
            <p>Чтобы избежать спама и злоупотребления функционалом, на постановку/удаление меток действуют следующие ограничения:</p>
            <p>• Ставить метку пользователь может не чаще 1 раз в 5 минут.</p>
            <p>• Удалять — не чаще 1 раз в 15 минут.</p>
          </>
        )
      },
      {
        title: "Доступ к карте",
        content: (
          <>
            <p>Чтобы открыть карту, нужно соблюсти два условия:</p>
            <p>• Активировать подписку (во вкладке Подписка);</p>
            <p>• Выбрать город (во вкладке Профиль).</p>
            <p>После этого доступ к карте откроется моментально и пользователь сможет воспользоваться полным функционалом.</p>
          </>
        )
      }
    ].map((item, index) => (
      <details
        key={index}
        style={{
          background: "rgba(255,255,255,0.02)",
          borderRadius: 14,
          padding: "12px 16px",
          marginBottom: 12,
          cursor: "pointer",
        }}
      >
        <summary style={{ fontWeight: 600, fontSize: 16, cursor: "pointer", color: "#fff", paddingLeft: 12, listStyle: "none", }}>
          {item.title}
        </summary>
        <div style={{ marginTop: 8, fontSize: 14, color: "#ccc", lineHeight: "1.5" }}>
          {item.content}
        </div>
      </details>
    ))}
  </div>
)}

  {/* Подписка */}
  {activeTab === "subscription" && (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
		alignItems: "center",
        gap: 16,
		width: "100%",
        maxWidth: 300,
        margin: "0 auto",
		padding: "0 16px",
		boxSizing: "border-box",
        marginTop: "30px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Helvetica Neue', Helvetica, Arial, sans-serif",
        fontSize: 16,
        color: "#aaa",
      }}
    >
    {/* Блок: Статус подписки */}
    <div
      style={{
        backgroundColor: "#0a1f33",
        borderRadius: 24,
        padding: 16,
        width: "100%",
        textAlign: "center",
        boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
        color: "#fff",
      }}
    >
      {hasSubscription && user?.subscription?.expiresAt ? (
        <p style={{ margin: 0 }}>
          Активна до:{" "}
          <b>{new Date(user.subscription.expiresAt).toLocaleDateString()}</b>
        </p>
      ) : (
        <p style={{ margin: 0, color: "#fff" }}>Подписка не активна</p>
      )}
    </div>
	
	{/* Блок с кнопками подписки */}
    <div style={{
      backgroundColor: "#0a1f33",
      borderRadius: 24,
      padding: 16,
      width: "100%",
      textAlign: "center",
      boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
	  alignItems: "center",
      display: "flex",
      flexDirection: "column",
	  justifyContent: "center",
      gap: 23,
    }}>

    {/* Кнопка подписки */}
    <button
      onClick={handleBuySubscription}
      disabled={loadingSubscription}
      style={{
        marginTop: 8,
        padding: "14px 0",
        background: "linear-gradient(90deg, #2787f5, #7a5cff)",
        color: "#fff",
        border: "none",
        borderRadius: 16,
        cursor: "pointer",
        fontWeight: 600,
        fontSize: 16,
        width: "100%",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background =
          "linear-gradient(90deg, #1e6cd8, #693bff)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background =
          "linear-gradient(90deg, #2787f5, #7a5cff)")
      }
    >
      {loadingSubscription ? "Активируем..." : "Активировать подписку"}
    </button>
	
	{/* Кнопка отмены автопродления */}
    <button
      style={{
        background: "none",
        border: "none",
        color: "#ffc7c7",
        fontWeight: 600,
        fontSize: 16,
        cursor: "pointer",
		width: "100%",
        marginTop: 6,
		marginBottom: 8,
      }}
    >
      Отменить автопродление
    </button>
	</div>

    {/* Разделительная линия */}
    <div
      style={{
        height: 1,
        background: "rgba(255,255,255,0.1)",
        marginTop: 22,
		marginBottom: 22,
        width: "100%",
      }}
    />

  {/* Вопросы (аккордеон) */}
  <div
    style={{
      display: "flex",
      flexDirection: "column",
	  alignItems: "center",
      gap: 12,
      width: "100%",
    }}
  >
  {[
    {
      q: "Как активировать/продлить подписку?",
      a: (
        <div>
          <p style={{ margin: "0 0 6px 0" }}>
            Чтобы активировать/продлить подписку:
          </p>
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            <li>Кликните по кнопке выше;</li>
            <li>Вы будете перенаправлены на страницу оплаты;</li>
            <li>Выберите удобный способ оплаты и нажмите «Оплатить».</li>
          </ul>
        </div>
      ),
    },
    {
      q: "Какие способы оплаты есть?",
      a: (
        <div>
          <p style={{ margin: "0 0 6px 0" }}>
            Мы предлагаем самые распространённые и удобные способы оплаты:
          </p>
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            <li>Онлайн по карте</li>
            <li>Через СБП</li>
            <li>Через T-Pay или Sber-Pay</li>
          </ul>
        </div>
      ),
    },
    {
      q: "Какая стоимость подписки?",
      a: <p style={{ margin: 0 }}>Стоимость подписки составляет 99₽/мес.</p>,
    },
    {
      q: "Можно ли подключить автоплатёж?",
      a: (
        <div>
          <p style={{ margin: 0 }}>
            Да. На странице оплаты можно подключить автоплатёж и не оплачивать вручную каждый месяц.
          </p>
          <i>
            <p style={{ margin: "6px 0 0 0", fontSize: 13, color: "#bbb" }}>
              * Автоплатёж можно отключить в любой момент по кнопке выше.
            </p>
          </i>
        </div>
      ),
    },
  ].map((item, idx) => (
    <details
      key={idx}
      style={{
        background: "rgba(255,255,255,0.02)",
        borderRadius: 16,
        padding: "14px 18px",
        cursor: "pointer",
        color: "#ddd",
		width: "100%",
      }}
    >
      <summary
        style={{
          listStyle: "none",
          fontWeight: 600,
          fontSize: 15,
          cursor: "pointer",
        }}
      >
        {item.q}
      </summary>
      <div style={{ marginTop: 8, fontSize: 14, lineHeight: "1.4" }}>
        {item.a}
      </div>
    </details>
  ))}
  </div>
 </div>
)}
        </main>
      )}
    </div>
  );
}