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

  const isMapActive = activeTab === "map";

  const VK_CLIENT_ID = process.env.REACT_APP_VK_CLIENT_ID; // должен быть в .env

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/auth/status", { credentials: "include" });
        const data = await res.json();
        if (data.authorized) {
          setIsAuthorized(true);
          setActiveTab("account");
        } else {
          setIsAuthorized(false);
          setActiveTab("auth");
        }
      } catch (err) {
        console.error("Ошибка проверки авторизации:", err);
        setIsAuthorized(false);
        setActiveTab("auth");
      }
    }
    checkAuth();
  }, []);

  const handleVKLogin = () => {
    // VK ID SDK Authorization
    const redirect_uri = window.location.origin; 
    const url = `https://oauth.vk.com/authorize?client_id=${VK_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      redirect_uri
    )}&display=page&response_type=code&scope=email`;
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

  // Дальше твой UI для вкладок account, subscription, map (как раньше)
  return (
    <div style={{ height: "100vh", backgroundColor: tabColors.background, color: tabColors.text, display: "flex", flexDirection: "column" }}>
      {/* Навигация */}
      {!isMapActive && (
        <nav style={{ display: "flex", justifyContent: "center", backgroundColor: tabColors.active }}>
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
                transition: "background-color 0.3s",
              }}
            >
              {tab === "account" && "Аккаунт"}
              {tab === "subscription" && "Подписка"}
              {tab === "map" && "Карта"}
            </button>
          ))}
        </nav>
      )}
      {/* Контент */}
      {isMapActive ? (
        hasSubscription ? <MapView /> : <div>Доступ к карте ограничен</div>
      ) : (
        <main>{activeTab === "account" ? <div>Аккаунт</div> : <div>Подписка</div>}</main>
      )}
    </div>
  );
}
