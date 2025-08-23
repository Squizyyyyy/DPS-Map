import React, { useState, useEffect } from "react";
import MapView from "./MapView";
import sha256 from "crypto-js/sha256";
import Base64 from "crypto-js/enc-base64";

const tabColors = {
  background: "#001c39",
  active: "#063353",
  inactive: "#0a3b66",
  text: "#fff",
};

// ---------------------- PKCE ----------------------
function generateCodeVerifier() {
  const array = new Uint32Array(56);
  window.crypto.getRandomValues(array);
  return Array.from(array, (dec) => ("0" + (dec % 256).toString(16)).slice(-2)).join("");
}

function generateCodeChallenge(codeVerifier) {
  const hash = sha256(codeVerifier);
  return Base64.stringify(hash).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function MainPage() {
  const [activeTab, setActiveTab] = useState("account");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  const isMapActive = activeTab === "map";

  // ---------------------- Проверка сессии и VK авторизация ----------------------
  useEffect(() => {
    async function checkSession() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        const errorParam = urlParams.get("error");

        if (errorParam) {
          console.error("Ошибка от VK:", errorParam);
          setError("Ошибка авторизации через VK");
          window.history.replaceState({}, document.title, "/");
          return;
        }

        if (code) {
          const codeVerifier = localStorage.getItem("vk_code_verifier");
          if (codeVerifier) {
            const res = await fetch("/auth/vk/exchange", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ code, code_verifier: codeVerifier }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
              setIsAuthorized(true);
              setUser(data.user);
              setActiveTab("account");
              localStorage.removeItem("vk_code_verifier");
              window.history.replaceState({}, document.title, "/");
              return;
            } else {
              console.error("Ошибка обмена токена:", data);
              setError("Не удалось авторизоваться через VK");
            }
          } else {
            console.error("Нет code_verifier в localStorage");
            setError("Отсутствует code_verifier");
          }
        }

        // Проверка текущей сессии
        const statusRes = await fetch("/auth/status", { credentials: "include" });
        const statusData = await statusRes.json();
        if (statusData.authorized) {
          setIsAuthorized(true);
          setUser(statusData.user);
          setActiveTab("account");
        } else {
          setIsAuthorized(false);
        }
      } catch (err) {
        console.error("Ошибка проверки авторизации:", err);
        setError("Ошибка проверки авторизации");
        setIsAuthorized(false);
      }
    }

    checkSession();
  }, []);

  // ---------------------- VK Login ----------------------
  const handleVKLogin = async () => {
    try {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      localStorage.setItem("vk_code_verifier", codeVerifier);

      const res = await fetch("/auth/vk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code_challenge: codeChallenge }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Не удалось получить ссылку на VK авторизацию");
      }
    } catch (err) {
      console.error("Ошибка VK Login:", err);
      setError("Ошибка инициализации VK авторизации");
    }
  };

  // ---------------------- Logout ----------------------
  const handleLogout = async () => {
    await fetch("/auth/logout", { credentials: "include", method: "POST" });
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
        }}
      >
        <h2>Авторизация</h2>
        <p>Чтобы пользоваться сайтом, войдите через VK ID.</p>
        {error && <p style={{ color: "red" }}>{error}</p>}
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
                <img src={user.info.photo_100} alt="avatar" />
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
