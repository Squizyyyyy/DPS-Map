import React, { useState } from 'react';
import MapView from './MapView';

const tabColors = {
  background: '#001c39',
  active: '#063353',
  inactive: '#0a3b66',
  text: '#fff',
};

export default function MainPage() {
  const [activeTab, setActiveTab] = useState('account');
  const [backBtnHover, setBackBtnHover] = useState(false);

  const isMapActive = activeTab === 'map';

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
      {/* Навигация только если НЕ карта */}
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

      {/* Контент */}
      {isMapActive ? (
        // Карта на весь экран
        <div style={{ flex: 1, height: '100vh', width: '100vw' }}>
          <MapView />
          {/* Кнопка назад */}
          <button
            onClick={() => setActiveTab('account')}
            onMouseEnter={() => setBackBtnHover(true)}
            onMouseLeave={() => setBackBtnHover(false)}
            style={{
              position: 'absolute',
              top: 18, // чуть ниже
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
            &times;
          </button>
        </div>
      ) : (
        <main style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
          {activeTab === 'account' && (
            <div>
              <h2>Аккаунт</h2>
              <p>Здесь будет информация об аккаунте пользователя.</p>
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
