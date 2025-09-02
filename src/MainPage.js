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
  { name: "Не выбран", coords: null },
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

  // 🔹 selectedCity по умолчанию "Не выбран"
  const [selectedCity, setSelectedCity] = useState(cities[0]);

  const isMapActive = activeTab === "map";

  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.documentElement.style.margin = "0";
    document.documentElement.style.padding = "0";
    document.body.style.height = "100%";
    document.documentElement.style.height = "100%";
  }, []);

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

          // 🔹 Проверяем город после подписки
          if (data.user.city) {
            const city = cities.find((c) => c.name === data.user.city);
            setSelectedCity(city || cities[0]);
          } else {
            setSelectedCity(cities[0]);
          }
        }
      } catch (e) {
        console.error("Auth status error:", e);
      }
    })();
  }, []);

  // VKID SDK
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
          setSelectedCity(city || cities[0]);
        } else {
          setSelectedCity(cities[0]);
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
    setSelectedCity(cities[0]); // 🔹 сброс города при логауте
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

  // 🔹 Render
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
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 30, color: "#fff" }}>Авторизация</h2>
          <p style={{ fontSize: 16, color: "#ccc", marginBottom: 24, textAlign: "center" }}>
            Чтобы продолжить, войдите через VK ID или Telegram
          </p>
          {error && <p style={{ color: "#ff3b30", marginBottom: 16, textAlign: "center" }}>{error}</p>}
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
            <button
              onClick={handleLogin}
              disabled={!sdkReady || loadingLogin}
              style={{
                width: "100%",
                padding: "10px 0",
                background: sdkReady ? `linear-gradient(90deg, #2787f5, #0a90ff)` : "#6c757d",
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
            <div id="telegram-button-container" style={{ display: "flex", justifyContent: "center", width: "100%" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", backgroundColor: tabColors.background, color: tabColors.text, display: "flex", flexDirection: "column" }}>
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
          overflow: "hidden",
        }}
      >
        {["account", "subscription", "map"].map((tab) => (
          <div
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "14px 0",
              background: activeTab === tab ? `linear-gradient(135deg, #2787f5, #1449a3)` : tabColors.inactive,
              color: tabColors.text,
              cursor: "pointer",
              fontWeight: activeTab === tab ? "700" : "500",
              fontSize: activeTab === tab ? "16px" : "15px",
              transform: activeTab === tab ? "scale(1.07)" : "scale(1)",
              transition: "all 0.08s ease",
            }}
          >
            {tab === "account" && "Профиль"}
            {tab === "subscription" && "Подписка"}
            {tab === "map" && "Карта"}
          </div>
        ))}
      </nav>

      {isMapActive ? (
        // 🔹 Новая логика: сначала проверка подписки, потом города
        !hasSubscription ? (
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
        ) : selectedCity.name === "Не выбран" ? (
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
            <h2>Чтобы открыть карту, выберите город в разделе "Профиль"</h2>
          </div>
        ) : (
          <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 9999 }}>
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