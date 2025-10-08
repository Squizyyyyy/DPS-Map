import React, { useState } from "react";

export default function SubscriptionModal({ onClose }) {
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);

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
        padding: "16px", // минимальный отступ от краёв
        boxSizing: "border-box",
        zIndex: 10000,
      }}
    >
      <div
        style={{
          backgroundColor: "#0a1f33",
          borderRadius: 24,
          padding: "24px 16px 32px 16px",
          maxWidth: 400,
          width: "100%",
          position: "relative",
          boxSizing: "border-box",
          color: "#fff",
        }}
      >
        {/* Крестик в верхнем правом углу */}
        <div
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            fontSize: 20,
            fontWeight: "bold",
            cursor: "pointer",
            color: "#fff",
          }}
        >
          ×
        </div>

        <h2 style={{ margin: "0 0 20px 0", textAlign: "center" }}>
          Выберите период и способ оплаты
        </h2>

        {/* Период подписки */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 20 }}>
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
                backgroundColor: selectedPeriod === period.value ? "#1e2b45" : "#0a1f33",
                color: "#fff",
                cursor: "pointer",
                flex: 1,
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
              onClick={() => setSelectedPayment(payment.value)}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: selectedPayment === payment.value ? "2px solid #2787f5" : "2px solid transparent",
                backgroundColor: selectedPayment === payment.value ? "#1e2b45" : "#0a1f33",
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

        {/* Кнопка Далее */}
        <button
          onClick={() => {
            if (selectedPayment === "sbp") {
              alert(
                "Для перевода через СБП, перейдите в свой мобильный банк и совершите перевод:\n\n" +
                "Номер для перевода: +79958962951" +
                "Банк получателя: Юмани (ЮMoney)"
              );
            }
          }}
          style={{
            display: "block",
            margin: "0 32px",
            padding: "10px 0px",
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
      </div>
    </div>
  );
}
