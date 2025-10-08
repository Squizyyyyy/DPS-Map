import React, { useState, useEffect } from "react";

export default function SubscriptionModal({ onClose }) {
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showSbpInfo, setShowSbpInfo] = useState(false);
  const [timer, setTimer] = useState(null);
  
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

const handleNext = () => {
    if (selectedPayment === "sbp") {
      setShowSbpInfo(true);
      setTimer(15 * 60);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "32px",
        boxSizing: "border-box",
        zIndex: 10000,
      }}
    >
      <div
        style={{
          backgroundColor: "#0a1f33",
          borderRadius: 24,
          padding: "25px 20px 25px 20px",
          maxWidth: 400,
          width: "100%",
          position: "relative",
          boxSizing: "border-box",
          color: "#fff",
        }}
      >
      {/* Крестик */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 20,
          right: 10,
          background: "transparent",
          border: "none",
          color: "#fff",
          fontSize: 20,
          cursor: "pointer",
          padding: 0,
          lineHeight: 1,
        }}
        aria-label="Закрыть"
      >
        ✕
      </button>


        <h2 style={{ margin: "0 0 20px 0", textAlign: "center", fontSize: 18, }}>
          Выберите период и способ оплаты
        </h2>

        {/* Период подписки */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 14 }}>
          {[
            { label: "1 месяц (99р)", value: "1m" },
            { label: "3 месяца (289р)", value: "3m" },
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
                cursor: "pointer",
                flex: 1,
                textAlign: "center",
                transition: "all 0.2s",
              }}
            >
              {period.label}
            </button>
          ))}
        </div>

        {/* Способы оплаты */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 24 }}>
          {[
            { label: "Картой онлайн", value: "card" },
            { label: "Перевод через СБП", value: "sbp" },
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
                cursor: "pointer",
                minWidth: 120,
                textAlign: "center",
                transition: "all 0.2s",
              }}
            >
              {payment.label}
            </button>
          ))}
        </div>

      {/* Кнопка Далее или Таймер */}
      {selectedPayment === "sbp" && timer !== null ? (
        <div
          style={{
            textAlign: "center",
            margin: "0 32px",
            padding: "8px 0",
            background: "#2787f5",
            borderRadius: 12,
            color: "#fff",
            fontWeight: 600,
            fontSize: 16,
          }}
        >
          {formatTime(timer)}
        </div>
      ) : (
        <button
          onClick={handleNext}
          style={{
            display: "block",
            margin: "0 32px",
            padding: "8px 0px",
            background: "#2787f5",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 16,
            transition: "all 0.2s",
            width: "calc(100% - 64px)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#1e6cd8")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#2787f5")}
        >
          Далее
        </button>
      )}

{/* Инструкция по СБП */}
{showSbpInfo && (
  <div
    style={{
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
      zIndex: 10,
    }}
  >
    {/* Верхний текст, по центру */}
    <div style={{ textAlign: "center", marginBottom: 8 }}>
      Для перевода через СБП, перейдите в свой мобильный банк и совершите перевод по реквизитам, указанным ниже.
    </div>
	<div style={{ textAlign: "center", marginBottom: 8, fontStyle: "italic" }}>
      Перевод необходимо совершить до окончания таймера
    </div>

    {/* Основные реквизиты */}
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span>Номер для перевода: <b>+7(995) 896-29-51</b></span>
      <span>Банк получателя: <b>Юмани (ЮMoney)</b></span>
    </div>

    {/* Кнопка "Понятно" */}
    <div
      onClick={() => setShowSbpInfo(false)}
      style={{
        marginTop: 8,
        cursor: "pointer",
        color: "#2787f5",
        textAlign: "center",
        lineHeight: 0.8,
        fontSize: 16,
        fontWeight: "bold",
        userSelect: "none",
      }}
    >
      <div>Понятно</div>
    </div>
  </div>
)}		
      </div>
    </div>
  );
}
