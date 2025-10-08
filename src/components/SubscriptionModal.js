import React, { useState } from "react";

export default function SubscriptionModal({ onClose }) {
  const [paymentPeriod, setPaymentPeriod] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [showSbpInstructions, setShowSbpInstructions] = useState(false);

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
        zIndex: 2000,
      }}
    >
      <div
        style={{
          backgroundColor: "#0a1f33",
          padding: 24,
          borderRadius: 16,
          maxWidth: 400,
          width: "90%",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <h3 style={{ margin: 0, textAlign: "center" }}>
          Выберите период и способ оплаты
        </h3>

        {/* Период подписки */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <label style={{ flex: 1, textAlign: "center" }}>
            <input
              type="radio"
              name="period"
              value="1"
              checked={paymentPeriod === "1"}
              onChange={() => setPaymentPeriod("1")}
            />
            1 месяц (99₽)
          </label>
          <label style={{ flex: 1, textAlign: "center" }}>
            <input
              type="radio"
              name="period"
              value="3"
              checked={paymentPeriod === "3"}
              onChange={() => setPaymentPeriod("3")}
            />
            3 месяца (289₽)
          </label>
        </div>

        {/* Способ оплаты */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>
            <input
              type="radio"
              name="method"
              value="card"
              checked={paymentMethod === "card"}
              onChange={() => setPaymentMethod("card")}
            />
            Картой онлайн
          </label>
          <label>
            <input
              type="radio"
              name="method"
              value="sbp"
              checked={paymentMethod === "sbp"}
              onChange={() => setPaymentMethod("sbp")}
            />
            Перевод через СБП
          </label>
        </div>

        {/* Кнопка Далее */}
        <button
          style={{
            padding: "10px 0",
            background: "#2787f5",
            border: "none",
            borderRadius: 12,
            fontWeight: 600,
            cursor: "pointer",
            color: "#fff",
          }}
          onClick={() => {
            if (paymentMethod === "card") {
              alert("Онлайн-карта пока не реализована");
            } else if (paymentMethod === "sbp") {
              setShowSbpInstructions(true);
            }
          }}
        >
          Далее
        </button>

        {/* Инструкция СБП */}
        {showSbpInstructions && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              background: "rgba(255,255,255,0.05)",
              borderRadius: 12,
              textAlign: "center",
              lineHeight: "1.5",
            }}
          >
            <p>
              Для перевода через СБП, вам необходимо перейти в свой мобильный
              банк и совершить перевод через СБП по указанному ниже номеру на
              указанный ниже банк.
            </p>
            <p style={{ marginTop: 8 }}>
              Номер для перевода: <b>+7 (995) 896-29-51</b>
            </p>
            <p>
              Банк получателя: <b>ЮMoney</b>
            </p>
          </div>
        )}

        {/* Кнопка закрыть модалку */}
        <button
          style={{
            marginTop: 12,
            padding: "6px 0",
            background: "none",
            border: "1px solid #fff",
            borderRadius: 12,
            cursor: "pointer",
            color: "#fff",
          }}
          onClick={() => {
            onClose();
          }}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
