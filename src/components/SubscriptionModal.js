import React, { useState, useEffect } from "react";

export default function SubscriptionModal({ onClose }) {
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showSbpInfo, setShowSbpInfo] = useState(false);
  const [timer, setTimer] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

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

  const handleNext = async () => {
    if (selectedPayment === "sbp") {
      if (!selectedPeriod) {
        alert("Выберите период подписки");
        return;
      }

      // 💬 определяем сумму по выбранному периоду
      const amount = selectedPeriod === "1m" ? 99 : 289;

      // 💬 последние цифры ЮMoney счёта (для проверки на сервере)
      const last4Digits = "2951"; // последние цифры номера +7(995)896-29-51

      try {
        setLoading(true);

        // 💬 отправляем запрос на сервер, чтобы создать запись платежа
        const response = await fetch("/subscription/sbp-init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ last4Digits, amount }),
        });

        const data = await response.json();

        if (data.success) {
          console.log("✅ Платёж зарегистрирован:", data.paymentId);
          setShowSbpInfo(true);
          setTimer(15 * 60); // 15 минут на оплату
        } else {
          alert("Ошибка инициализации платежа");
        }
      } catch (err) {
        console.error("Ошибка при создании платежа:", err);
        alert("Ошибка соединения с сервером");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText("9958962951");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            top: 7,
            right: 10,
            background: "transparent",
            border: "none",
            color: "#888",
            fontSize: 20,
            cursor: "pointer",
            padding: 0,
            lineHeight: 1,
          }}
          aria-label="Закрыть"
        >
          ✕
        </button>

        <h2
          style={{
            margin: "0 0 27px 0",
            textAlign: "center",
            fontSize: 18,
          }}
        >
          Выберите период и способ оплаты
        </h2>

        {/* Период подписки */}
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          {[
            { label: "1 месяц - 99₽", value: "1m" },
            { label: "3 месяца - 289₽", value: "3m" },
          ].map((period) => (
            <button
              key={period.value}
              onClick={() => setSelectedPeriod(period.value)}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border:
                  selectedPeriod === period.value
                    ? "2px solid #2787f5"
                    : "2px solid transparent",
                backgroundColor: "#1e2b45",
                color: "#fff",
                fontWeight: 600,
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

        {/* Разделительная линия */}
        <div
          style={{
            height: "1px",
            backgroundColor: "rgba(255, 255, 255, 0.2)",
            width: "calc(100% - 32px)",
            margin: "0 auto 16px auto",
          }}
        ></div>

        {/* Способы оплаты */}
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            marginBottom: 27,
          }}
        >
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
                border:
                  selectedPayment === payment.value
                    ? "2px solid #2787f5"
                    : "2px solid transparent",
                backgroundColor: "#1e2b45",
                color: "#fff",
                fontWeight: 600,
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
              borderRadius: 16,
              color: "#fff",
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            {formatTime(timer)}
          </div>
        ) : (
          <button
            onClick={handleNext}
            disabled={loading}
            style={{
              display: "block",
              margin: "0 32px",
              padding: "8px 0px",
              background: loading ? "#1e6cd8aa" : "#2787f5",
              color: "#fff",
              border: "none",
              borderRadius: 16,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 15,
              transition: "all 0.2s",
              width: "calc(100% - 64px)",
            }}
          >
            {loading ? "Создаём платёж..." : "Далее"}
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
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              Перейдите в свой мобильный банк и совершите перевод через СБП по
              реквизитам, указанным ниже.
            </div>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              Переводите ровно выбранную сумму!
            </div>
            <div
              style={{ textAlign: "center", marginBottom: 13, fontStyle: "italic" }}
            >
              * Перевод необходимо совершить до окончания таймера.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span>
                  Номер: <b style={{ fontSize: 14 }}>+7(995) 896-29-51</b>
                </span>

                <div
                  onClick={handleCopy}
                  title="Скопировать номер"
                  style={{
                    position: "relative",
                    width: 14,
                    height: 14,
                    cursor: "pointer",
                    marginLeft: 4,
                    marginTop: -5,
                  }}
                >
                  <div
                    id="copy-icon"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      border: "1.6px solid #2787f5",
                      borderRadius: 2,
                      transition: "all 0.3s ease",
                    }}
                  ></div>
                  <div
                    style={{
                      position: "absolute",
                      top: 3,
                      left: 3,
                      width: "100%",
                      height: "100%",
                      border: "1.6px solid #2787f5",
                      borderRadius: 2,
                      opacity: 0.6,
                    }}
                  ></div>
                </div>
              </div>
              <span>
                Банк получателя: <b style={{ fontSize: 14 }}>Юмани (ЮMoney)</b>
              </span>
            </div>

            <div
              onClick={() => setShowSbpInfo(false)}
              style={{
                marginTop: 14,
                cursor: "pointer",
                color: "#2787f5",
                textAlign: "center",
                lineHeight: 0.8,
                fontSize: 15,
                fontWeight: 500,
                userSelect: "none",
              }}
            >
              <div>Понятно</div>
            </div>
          </div>
        )}

        {copied && (
          <div
            style={{
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
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
              textAlign: "center",
            }}
          >
            Номер скопирован!
          </div>
        )}
      </div>
    </div>
  );
}