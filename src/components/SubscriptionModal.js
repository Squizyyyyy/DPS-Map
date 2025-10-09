import React, { useState, useEffect } from "react";

export default function SubscriptionModal({ onClose }) {
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showSbpInfo, setShowSbpInfo] = useState(false);
  const [timer, setTimer] = useState(null);
  const [copied, setCopied] = useState(false);
  const [last4Digits, setLast4Digits] = useState("");

  useEffect(() => {
    let interval;
    if (timer !== null && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText("9958962951");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNext = async () => {
    if (!selectedPeriod) return alert("Выберите период подписки");
    if (!selectedPayment) return alert("Выберите способ оплаты");

    if (selectedPayment === "sbp") {
      setShowSbpInfo(true);
      setTimer(15 * 60);

      // Определяем сумму
      const amount = selectedPeriod === "1m" ? 99 : 289;

      // Спрашиваем последние 4 цифры
      const digits = prompt("Введите последние 4 цифры номера с которого будете переводить:");
      if (!digits || digits.length !== 4) return alert("Введите корректные 4 цифры");
      setLast4Digits(digits);

      try {
        const resp = await fetch("/subscription/sbp-init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ last4Digits: digits, amount }),
        });
        const data = await resp.json();
        if (!data.success) {
          alert("Ошибка инициализации СБП платежа");
        } else {
          alert("Платёж инициализирован! Совершите перевод через СБП по указанным реквизитам.");
        }
      } catch (e) {
        console.error(e);
        alert("Ошибка при обращении к серверу");
      }
    } else {
      // TODO: онлайн-карта (карта через ЮMoney или платёжный провайдер)
      alert("Онлайн-карта пока не реализована");
    }
  };

  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0,
      width: "100%", height: "100%",
      backgroundColor: "rgba(0,0,0,0.6)",
      display: "flex", justifyContent: "center", alignItems: "center",
      padding: "32px", boxSizing: "border-box", zIndex: 10000
    }}>
      <div style={{
        backgroundColor: "#0a1f33",
        borderRadius: 24,
        padding: "25px 20px",
        maxWidth: 400,
        width: "100%",
        position: "relative",
        boxSizing: "border-box",
        color: "#fff"
      }}>
        {/* Крестик */}
        <button onClick={onClose} style={{
          position: "absolute",
          top: 7, right: 10,
          background: "transparent",
          border: "none",
          color: "#888",
          fontSize: 20,
          cursor: "pointer",
          padding: 0,
          lineHeight: 1
        }} aria-label="Закрыть">✕</button>

        <h2 style={{ margin: "0 0 27px 0", textAlign: "center", fontSize: 18 }}>
          Выберите период и способ оплаты
        </h2>

        {/* Период подписки */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 16 }}>
          {[
            { label: "1 месяц - 99₽", value: "1m" },
            { label: "3 месяца - 289₽", value: "3m" }
          ].map((period) => (
            <button
              key={period.value}
              onClick={() => setSelectedPeriod(period.value)}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: selectedPeriod === period.value ? "2px solid #2787f5" : "2px solid transparent",
                backgroundColor: "#1e2b45",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
                flex: 1,
                textAlign: "center",
                transition: "all 0.2s"
              }}
            >
              {period.label}
            </button>
          ))}
        </div>

        {/* Способы оплаты */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 27 }}>
          {[
            { label: "Картой онлайн", value: "card" },
            { label: "Перевод через СБП", value: "sbp" }
          ].map((payment) => (
            <button
              key={payment.value}
              onClick={() => {
                setSelectedPayment(payment.value);
                setShowSbpInfo(false);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: selectedPayment === payment.value ? "2px solid #2787f5" : "2px solid transparent",
                backgroundColor: "#1e2b45",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
                minWidth: 120,
                textAlign: "center",
                transition: "all 0.2s"
              }}
            >
              {payment.label}
            </button>
          ))}
        </div>

        {/* Кнопка Далее или Таймер */}
        {selectedPayment === "sbp" && timer !== null ? (
          <div style={{
            textAlign: "center",
            margin: "0 32px",
            padding: "8px 0",
            background: "#2787f5",
            borderRadius: 16,
            color: "#fff",
            fontWeight: 600,
            fontSize: 15
          }}>
            {formatTime(timer)}
          </div>
        ) : (
          <button onClick={handleNext} style={{
            display: "block",
            margin: "0 32px",
            padding: "8px 0px",
            background: "#2787f5",
            color: "#fff",
            border: "none",
            borderRadius: 16,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 15,
            transition: "all 0.2s",
            width: "calc(100% - 64px)"
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#1e6cd8"}
          onMouseLeave={(e) => e.currentTarget.style.background = "#2787f5"}>
            Далее
          </button>
        )}

        {/* Инструкция по СБП */}
        {showSbpInfo && (
          <div style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#1a2738",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 13,
            width: "calc(100% - 32px)",
            boxSizing: "border-box",
            textAlign: "left",
            zIndex: 10
          }}>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              Перейдите в свой мобильный банк и совершите перевод через СБП по реквизитам ниже.
            </div>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              Переводите ровно выбранную сумму!
            </div>
            <div style={{ textAlign: "center", marginBottom: 13, fontStyle: "italic" }}>
              * Перевод необходимо совершить до окончания таймера.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div>Номер: <b>+7(995) 896-29-51</b> <span style={{ cursor: "pointer", color: "#2787f5" }} onClick={handleCopy}>копировать</span></div>
              <div>Банк получателя: <b>Юмани (ЮMoney)</b></div>
            </div>
          </div>
        )}

        {copied && (
          <div style={{
            position: "fixed",
            bottom: "12.5%",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#2787f5",
            color: "#fff",
            padding: "6px 12px",
            borderRadius: 16,
            fontSize: 13,
            zIndex: 20000,
            textAlign: "center"
          }}>Номер скопирован!</div>
        )}
      </div>
    </div>
  );
}
