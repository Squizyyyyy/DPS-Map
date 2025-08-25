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

  // Авторизация через Telegram
  const handleTelegramLogin = async () => {
    setLoadingLogin(true);
    setError(null);
    try {
      const width = 450;
      const height = 600;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;
      const tgWindow = window.open(
        `https://t.me/${process.env.REACT_APP_TELEGRAM_BOT_USERNAME}?start=auth`,
        "_blank",
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!tgWindow) {
        setError("Не удалось открыть окно Telegram");
        setLoadingLogin(false);
        return;
      }

      const handleMessage = async (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.telegramAuth) {
          try {
            const response = await fetch("/auth/telegram", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(event.data.telegramAuth),
            });
            const data = await response.json();
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
            console.error("Telegram login POST error:", e);
            setError("Ошибка авторизации через Telegram");
          } finally {
            setLoadingLogin(false);
            tgWindow.close();
          }
          window.removeEventListener("message", handleMessage);
        }
      };

      window.addEventListener("message", handleMessage);
    } catch (e) {
      console.error("Telegram login error:", e);
      setError("Ошибка авторизации через Telegram");
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
        <p>Чтобы пользоваться сайтом, войдите через Telegram.</p>
        {error && <p style={{ color: "red", maxWidth: 520 }}>{error}</p>}
        <button
          onClick={handleTelegramLogin}
          disabled={loadingLogin}
          style={{
            marginTop: 16,
            padding: "12px 24px",
            background: `#34A853`,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: !loadingLogin ? "pointer" : "default",
            fontWeight: 600,
            transition: "all 0.2s",
          }}
        >
          {loadingLogin ? "Входим..." : "Войти через Telegram"}
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
      <ToastContainer position="bottom-right" autoClose={3000} />
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
            <div>
              <h2>Добро пожаловать, {user?.info?.first_name || "гость"}!</h2>
              {user?.info?.photo_100 && (
                <img
                  src={user.info.photo_100}
                  alt="avatar"
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: "50%",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  }}
                />
              )}
              <p><b>ID пользователя:</b> {user?.id || "—"}</p>
              <p><b>Дата регистрации:</b> {user?.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}</p>

              <div style={{ marginTop: 24 }}>
                <h3>Ваш город</h3>
                <select
                  value={selectedCity.name}
                  onChange={(e) => {
                    const city = cities.find((c) => c.name === e.target.value);
                    if (city) setSelectedCity(city);
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid #fff",
                    backgroundColor: "#063353",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  {cities.map((city) => (
                    <option key={city.name} value={city.name}>
                      {city.name}
                    </option>
                  ))}
                </select>
                <p style={{ marginTop: 8 }}>
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
                      if (data.success) {
                        toast.success("Город сохранён");
                      } else {
                        toast.error(data.error || "Не удалось сохранить город");
                      }
                    } catch (e) {
                      console.error("Ошибка при сохранении города:", e);
                      toast.error("Ошибка сети при сохранении города");
                    }
                  }}
                  style={{
                    marginTop: 8,
                    padding: "8px 16px",
                    background: `linear-gradient(90deg, #2787f5, #0a90ff)`,
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Сохранить
                </button>
              </div>

              <button
                onClick={handleLogout}
                style={{
                  marginTop: 24,
                  padding: "10px 20px",
                  background: "#d9534f",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#c9302c")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#d9534f")}
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
