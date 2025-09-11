import React, { useState, useEffect } from "react";
import MapView from "./MapView";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { ReactComponent as AccountIcon } from "./assets/icons/account.svg";
import { ReactComponent as SubscriptionIcon } from "./assets/icons/sub.svg";
import { ReactComponent as MapIcon } from "./assets/icons/map.svg";

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
  
  // 🔹 Убираем стандартные отступы body/html
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
			textDecoration: "underline",
            gap: 8,                  // расстояние между текстом и иконкой
            color: "#ccc",
            fontSize: 14,
          }}
        >
          <span>Есть вопрос?</span>
		  
		  //--Telegram--//
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
			
			//--VK--//
			<a
              href="https://vk.com/stf2702"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center" }}
            >
		      <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 36 36"
                width="20"
                height="20"
                fill="#4680c2"
                style={{ cursor: "pointer" }}
              >
                <path d="M18 0C8.058 0 0 8.058 0 18s8.058 18 18 18 18-8.058 18-18S27.942 0 18 0zm7.708 25.292h-3.033c-.525 0-.712-.358-.943-.625-1.042-1.25-1.732-2.7-2.53-4.207-.225-.375-.4-.5-.625-.5-.15 0-.308.042-.475.183-.492.375-1.024.958-1.933 2.058-.508.583-.866.875-1.167.875-.108 0-.175-.033-.217-.067-.092-.075-.15-.267-.125-.508.067-.792.742-1.467 1.417-2.142.608-.608 1.242-1.092 1.492-1.317.058-.05.092-.083.117-.125.075-.125.067-.192.05-.25-.033-.092-.217-.625-.942-1.292-.5-.45-.867-.617-1.125-.617-.142 0-.25.025-.317.042-.108.033-.25.092-.392.2-.342.217-.9.675-1.542 1.267-.408.367-.675.55-.9.55-.133 0-.2-.05-.242-.117-.042-.05-.058-.133-.042-.25.042-.5.308-1.25 1.183-2.292.65-.783 1.233-1.175 1.633-1.367.517-.225.892-.283 1.1-.283.442 0 .55.133.825.467.258.308.517.683.8 1.167.35.608.667 1.058.917 1.358.175.192.308.292.467.292.058 0 .133-.017.175-.042.058-.042.1-.108.125-.192.033-.083.017-.175-.067-.308-.233-.425-.5-.95-.775-1.517-.175-.408-.317-.725-.45-.967-.2-.35-.45-.675-.667-.833-.333-.233-.517-.25-.55-.25-.075 0-.108 0-.175.033-.175.05-.55.275-1.017.642-.342.258-.55.392-.742.508-.292.15-.55.25-.767.317-.467.133-.783.142-.967.142-.342 0-.567-.067-.75-.25-.25-.25-.25-.767-.25-1.142v-1.225c0-.483.042-.767.192-.967.142-.183.342-.25.567-.25h1.683c.608 0 .825.083 1.175.367.267.217.683.633 1.267 1.25.283.283.467.483.567.608.05.058.108.1.15.108.058 0 .1-.042.133-.142.033-.092.033-.25.025-.492-.017-.525-.05-.875-.05-1.1 0-.333.017-.55.05-.708.05-.192.108-.342.183-.467.125-.25.333-.425.617-.467.55-.092 1.042.333 1.583.992.467.583.817 1.217 1.1 1.767.25.5.458.958.608 1.25.092.175.125.25.2.25.025 0 .075-.017.108-.058.05-.033.067-.1.058-.192-.033-.25-.175-.625-.567-1.158-.283-.392-.508-.667-.758-.9-.25-.25-.458-.433-.567-.525-.125-.092-.142-.108-.167-.142-.05-.05-.058-.083-.058-.142 0-.033 0-.067.008-.092.05-.183.142-.5.25-.917.175-.567.317-1.092.467-1.5.108-.333.2-.567.25-.683.125-.275.242-.45.4-.508.2-.075.483-.083.867.017.583.142 1.2.533 1.817 1.133.45.433.8.875 1.058 1.183.183.192.25.25.342.25.058 0 .142-.05.225-.183.092-.133.142-.317.183-.558.033-.183.042-.358.058-.475.025-.2.05-.333.075-.45.058-.225.125-.467.2-.625.05-.125.092-.2.15-.242.108-.075.2-.075.325-.075.433 0 .975.15 1.667.492.567.283 1.008.567 1.367.808.408.258.708.433.875.5.092.042.175.058.2.058.042 0 .067-.017.083-.058.025-.05.025-.125.025-.217 0-.233-.033-.625-.05-1.108-.025-.517-.058-.933-.067-1.167 0-.092.017-.142.042-.175.025-.033.05-.05.."/>
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

{/* Нижняя панель вкладок */}
<nav
  style={{
    position: "fixed",
    bottom: 0,
    left: 0,
    width: "100%",
    display: "flex",
    justifyContent: "space-around",
    backgroundColor: tabColors.background, // фон как у страницы
    borderTop: "1px solid rgba(255, 255, 255, 0.1)", // тонкая разделительная линия
    boxShadow: "none", // убрали тень
    zIndex: 1000,
	paddingTop: 6.5,   // отступ иконок от верхней границы панели
	paddingBottom: 35, // увеличили высоту панели
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
		flexDirection: "column", // иконка сверху, подпись снизу
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
          color: activeTab === key ? "#2787f5" : "#fff", // активная → синяя, остальные белые
          transition: "color 0.15s ease",
        }}
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

{isMapActive ? (
  hasSubscription ? (
    selectedCity.name === "Не выбран" ? (
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
        <h2>Выберите город</h2>
        <p>Карта будет доступна после выбора города.</p>
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
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "#f4f4f4")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "#fff")
          }
        >
          ←
        </button>
      </div>
    )
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
          background: "linear-gradient(90deg, #2787f5, #0a90ff)",
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

    {/* ---- Выбор города ---- */}
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

    {/* ---- Выйти ---- */}
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
	
	{/* ---- Связь с нами ---- */}
    <div
      style={{
        marginTop: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
		textDecoration: "underline",
        gap: 8,
        color: "#aaa",
        fontSize: 13,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'San Francisco', Helvetica, Arial, sans-serif",
      }}
    >
      <span>Связь с нами:</span>
	  
	  //--Telegram--//
      <a
        href="https://t.me/dps_map_support"
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "flex", alignItems: "center", color: "#aaa" }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 240 240"
          width="20"
          height="20"
          fill="#0088cc"
        >
          <path d="M120 0C53.7 0 0 53.7 0 120s53.7 120 120 120 120-53.7 120-120S186.3 0 120 0zm57.1 82.8l-16.9 79.9c-1.3 5.7-4.7 7-9.5 4.3l-26.2-19.3-12.7 12.2c-1.4 1.4-2.5 2.5-5.1 2.5l1.8-25.1 45.7-41c2-1.8-0.4-2.8-3.1-1l-56.4 35.5-24.3-7.6c-5.3-1.6-5.4-5.3 1.1-7.8l94.9-36.6c4.4-1.5 8.2 1 6.8 7.4z"/>
        </svg>
		
		//--VK--//
		<a
          href="https://vk.com/stf2702"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center" }}
        >
		<svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 36 36"
          width="20"
          height="20"
          fill="#4680c2"
          style={{ cursor: "pointer" }}
        >
          <path d="M18 0C8.058 0 0 8.058 0 18s8.058 18 18 18 18-8.058 18-18S27.942 0 18 0zm7.708 25.292h-3.033c-.525 0-.712-.358-.943-.625-1.042-1.25-1.732-2.7-2.53-4.207-.225-.375-.4-.5-.625-.5-.15 0-.308.042-.475.183-.492.375-1.024.958-1.933 2.058-.508.583-.866.875-1.167.875-.108 0-.175-.033-.217-.067-.092-.075-.15-.267-.125-.508.067-.792.742-1.467 1.417-2.142.608-.608 1.242-1.092 1.492-1.317.058-.05.092-.083.117-.125.075-.125.067-.192.05-.25-.033-.092-.217-.625-.942-1.292-.5-.45-.867-.617-1.125-.617-.142 0-.25.025-.317.042-.108.033-.25.092-.392.2-.342.217-.9.675-1.542 1.267-.408.367-.675.55-.9.55-.133 0-.2-.05-.242-.117-.042-.05-.058-.133-.042-.25.042-.5.308-1.25 1.183-2.292.65-.783 1.233-1.175 1.633-1.367.517-.225.892-.283 1.1-.283.442 0 .55.133.825.467.258.308.517.683.8 1.167.35.608.667 1.058.917 1.358.175.192.308.292.467.292.058 0 .133-.017.175-.042.058-.042.1-.108.125-.192.033-.083.017-.175-.067-.308-.233-.425-.5-.95-.775-1.517-.175-.408-.317-.725-.45-.967-.2-.35-.45-.675-.667-.833-.333-.233-.517-.25-.55-.25-.075 0-.108 0-.175.033-.175.05-.55.275-1.017.642-.342.258-.55.392-.742.508-.292.15-.55.25-.767.317-.467.133-.783.142-.967.142-.342 0-.567-.067-.75-.25-.25-.25-.25-.767-.25-1.142v-1.225c0-.483.042-.767.192-.967.142-.183.342-.25.567-.25h1.683c.608 0 .825.083 1.175.367.267.217.683.633 1.267 1.25.283.283.467.483.567.608.05.058.108.1.15.108.058 0 .1-.042.133-.142.033-.092.033-.25.025-.492-.017-.525-.05-.875-.05-1.1 0-.333.017-.55.05-.708.05-.192.108-.342.183-.467.125-.25.333-.425.617-.467.55-.092 1.042.333 1.583.992.467.583.817 1.217 1.1 1.767.25.5.458.958.608 1.25.092.175.125.25.2.25.025 0 .075-.017.108-.058.05-.033.067-.1.058-.192-.033-.25-.175-.625-.567-1.158-.283-.392-.508-.667-.758-.9-.25-.25-.458-.433-.567-.525-.125-.092-.142-.108-.167-.142-.05-.05-.058-.083-.058-.142 0-.033 0-.067.008-.092.05-.183.142-.5.25-.917.175-.567.317-1.092.467-1.5.108-.333.2-.567.25-.683.125-.275.242-.45.4-.508.2-.075.483-.083.867.017.583.142 1.2.533 1.817 1.133.45.433.8.875 1.058 1.183.183.192.25.25.342.25.058 0 .142-.05.225-.183.092-.133.142-.317.183-.558.033-.183.042-.358.058-.475.025-.2.05-.333.075-.45.058-.225.125-.467.2-.625.05-.125.092-.2.15-.242.108-.075.2-.075.325-.075.433 0 .975.15 1.667.492.567.283 1.008.567 1.367.808.408.258.708.433.875.5.092.042.175.058.2.058.042 0 .067-.017.083-.058.025-.05.025-.125.025-.217 0-.233-.033-.625-.05-1.108-.025-.517-.058-.933-.067-1.167 0-.092.017-.142.042-.175.025-.033.05-.05.."/>
        </svg>
      </a>
    </div>

  </div>
)}

{/* ---- Подписка ---- */}
{activeTab === "subscription" && (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "calc(100vh - 80px)",
      padding: "0 16px",
    }}
  >
    <div
      style={{
        backgroundColor: "#0a1f33",
        borderRadius: 24,
        padding: "32px 20px",
        width: "100%",
        maxWidth: 320,
        textAlign: "center",
        boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'San Francisco', Helvetica, Arial, sans-serif",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 20,
          fontWeight: 700,
          color: "#fff",
        }}
      >
        Подписка
      </h2>

      {user?.subscription?.expiresAt ? (
        <p
          style={{
            color: "#aaa",
            fontSize: 14,
            marginTop: 12,
          }}
        >
          Подписка активна до:{" "}
          <b style={{ color: "#fff" }}>
            {new Date(user.subscription.expiresAt).toLocaleDateString()}
          </b>
        </p>
      ) : (
        <p
          style={{
            color: "#aaa",
            fontSize: 14,
            marginTop: 12,
          }}
        >
          Ваша подписка <b style={{ color: "#fff" }}>неактивна</b>.<br />
          Активируйте, чтобы воспользоваться всеми функциями карты.
        </p>
      )}

      <button
        style={{
          marginTop: 24,
          padding: "14px 0",
          background: "linear-gradient(90deg, #2787f5, #0a90ff)",
          color: "#fff",
          border: "none",
          borderRadius: 20,
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 15,
          width: "100%",
          transition: "all 0.2s",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'San Francisco', Helvetica, Arial, sans-serif",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background =
            "linear-gradient(90deg, #1e6cd8, #0470ff)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background =
            "linear-gradient(90deg, #2787f5, #0a90ff)")
        }
      >
        Активировать подписку
      </button>
    </div>
  </div>
)}
        </main>
      )}
    </div>
  );
}