import React, { useState, useEffect } from 'react';
import MapView from './MapView';

const API_URL = 'https://dps-map-rzn-h0uq.onrender.com'; // <-- сюда твой сервер на Render

const tabColors = {
  background: '#001c39',
  active: '#063353',
  inactive: '#0a3b66',
  text: '#fff',
};

export default function MainPage() {
  const [activeTab, setActiveTab] = useState('account');
  const [backBtnHover, setBackBtnHover] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [user, setUser] = useState(null);

  const isMapActive = activeTab === 'map';

  // Проверяем URL на наличие токена после редиректа с сервера
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token && !user) {
      localStorage.setItem('token', token);

      try {
        const payload = JSON.parse(atob(token.split('.')[1])); // декодируем JWT
        setUser({ name: payload.name, id: payload.id });
      } catch (err) {
        console.error('Ошибка декодирования токена:', err);
      }

      window.history.replaceState({}, document.title, '/'); // убираем ?token
    }
  }, [user]);

  // VK OAuth redirect
  const handleVKLogin = () => {
    window.location.href = `${process.env.REACT_APP_API_URL}/auth/vk`;
  };

  return (
    <div
      style={{
        height: '100vh',
        backgroundColor: tabColors.background,
        color: tabColors.text,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {!isMapActive && (
        <nav
          style={{
            display: 'flex',
            justifyContent: 'center',
            backgroundColor: tabColors.active,
          }}
        >
          {['account', 'subscription', 'map'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 24px',
                margin: '8px',
                backgroundColor:
                  activeTab === tab ? tabColors.inactive : tabColors.active,
                border: 'none',
                borderRadius: '4px',
                color: tabColors.text,
                cursor: 'pointer',
                fontWeight: activeTab === tab ? 'bold' : 'normal',
                transition: 'background-color 0.3s',
              }}
            >
              {tab === 'account' && 'Аккаунт'}
              {tab === 'subscription' && 'Подписка'}
              {tab === 'map' && 'Карта'}
            </button>
          ))}
        </nav>
      )}

      {isMapActive ? (
        hasSubscription ? (
          <div style={{ flex: 1, height: '100vh', width: '100vw' }}>
            <MapView />
            <button
              onClick={() => setActiveTab('account')}
              onMouseEnter={() => setBackBtnHover(true)}
              onMouseLeave={() => setBackBtnHover(false)}
              style={{
                position: 'absolute',
                top: 18,
                right: 14,
                zIndex: 1000,
                width: '35px',
                height: '35px',
                backgroundColor: backBtnHover ? '#f4f4f4' : '#ffffff',
                color: '#000',
                border: 'none',
                borderRadius: '50%',
                cursor: 'pointer',
                boxShadow: '0 0 6px rgba(0,0,0,0.3)',
                fontSize: '20px',
                fontWeight: 'bold',
                lineHeight: '35px',
                textAlign: 'center',
              }}
            >
              ←
            </button>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              color: '#fff',
              position: 'relative',
            }}
          >
            <button
              onClick={() => setActiveTab('account')}
              style={{
                position: 'absolute',
                top: 17.5,
                left: 14,
                zIndex: 1000,
                padding: '10px 20px',
                backgroundColor: tabColors.active,
                color: tabColors.text,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                boxShadow: '0 0 6px rgba(0,0,0,0.3)',
                fontSize: '14px',
                fontWeight: 'bold',
                transition: 'background-color 0.3s',
              }}
              onMouseEnter={(e) =>
                (e.target.style.backgroundColor = tabColors.inactive)
              }
              onMouseLeave={(e) =>
                (e.target.style.backgroundColor = tabColors.active)
              }
            >
              Назад
            </button>

            <h2>Доступ к карте ограничен</h2>
            <p>Чтобы использовать карту, необходимо оформить подписку.</p>
            <button
              onClick={() => setActiveTab('subscription')}
              style={{
                padding: '12px 24px',
                marginTop: '16px',
                backgroundColor: '#063353',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Оформить подписку
            </button>
          </div>
        )
      ) : (
        <main style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
          {activeTab === 'account' && (
            <div>
              <h2>Аккаунт</h2>
              {!user ? (
                <button
                  onClick={handleVKLogin}
                  style={{
                    padding: '12px 24px',
                    marginTop: '16px',
                    backgroundColor: '#4680C2',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Войти через VK
                </button>
              ) : (
                <p>Привет, {user.name}</p>
              )}
            </div>
          )}
          {activeTab === 'subscription' && (
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
