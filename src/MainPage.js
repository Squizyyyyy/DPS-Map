import React, { useState, useEffect } from "react";
import MapView from "./MapView";

const tabColors = {
  background: "#001c39",
  active: "#063353",
  inactive: "#0a3b66",
  text: "#fff",
};

export default function MainPage() {
  const [activeTab, setActiveTab] = useState("auth");
  const [backBtnHover, setBackBtnHover] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [user, setUser] = useState(null);

  const isMapActive = activeTab === "map";
  const VK_APP_ID = process.env.REACT_APP_VK_CLIENT_ID;
  const redirect_uri = process.env.REACT_APP_VK_REDIRECT_URI;

  useEffect(() => {
    // Проверка авторизации
    async function checkAuth() {
      try {
        const res = await fetch("/auth/status", { credentials: "include" });
        const data = await res.json();
        if (data.authorized) {
          setIsAuthorized(true);
          setUser(data.user);
          setActiveTab("account");
        } else {
          setIsAuthorized(false);
          setActiveTab("auth");
        }
      } catch (err) {
        console.error(err);
        setIsAuthorized(false);
        setActiveTab("auth");
      }
    }
    checkAuth();
  }, []);

  // VK ID login через One Tap
  const handleVKLogin = () => {
    const url = `https://oauth.vk.com/authorize?client_id=${VK_APP_ID}&display=page&redirect_uri=${encodeURIComponent(
      redirect_uri
    )}&response_type=code&scope=email`;
    window.location.href = url;
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
        }}
      >
        <h2>Авторизация</h2>
        <p>Чтобы пользоваться сайтом, войдите через VK.</p>
        <button
          onClick={handleVKLogin}
          style={{
            padding: "12px 24px",
            marginTop: "16px",
            backgroundColor: "#4680c2",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Войти через VK
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
      {!isMapActive && (
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
                backgroundColor: activeTab === tab ? tabColors.inactive : tabColors.active,
                border: "none",
                borderRadius: "4px",
                color: tabColors.text,
                cursor: "pointer",
                fontWeight: activeTab === tab ? "bold" : "normal",
              }}
            >
              {tab === "account" && "Аккаунт"}
              {tab === "subscription" && "Подписка"}
              {tab === "map" && "Карта"}
            </button>
          ))}
        </nav>
      )}

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
            }}
          >
            <h2>Доступ к карте ограничен</h2>
            <p>Чтобы использовать карту, необходимо оформить подписку.</p>
          </div>
        )
      ) : (
        <main style={{ flex: 1, padding: "16px", overflow: "auto" }}>
          {activeTab === "account" && (
            <div>
              <h2>Аккаунт</h2>
              <p>Привет, {user?.info?.first_name} {user?.info?.last_name}</p>
            </div>
          )}
          {activeTab === "subscription" && (
            <div>
              <h2>Подписка</h2>
              <p>Здесь будет информация о подписке (пока пусто).</p>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
