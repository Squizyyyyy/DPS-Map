import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function TelegramCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tgData = Object.fromEntries(params.entries());

    if (!tgData.id || !tgData.hash) {
      alert("Ошибка авторизации через Telegram");
      navigate("/");
      return;
    }

    fetch("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tgData),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          // setUser(data.user); // если у тебя есть состояние пользователя
          navigate("/"); // перенаправляем на главную
        } else {
          alert(data.error || "Ошибка авторизации через Telegram");
          navigate("/");
        }
      })
      .catch((e) => {
        console.error(e);
        alert("Ошибка сети при авторизации через Telegram");
        navigate("/");
      });
  }, [navigate]);

  return <p>Загрузка авторизации Telegram...</p>;
}