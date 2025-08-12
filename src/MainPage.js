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

  const isMapActive = activeTab === 'map';

  return (
    <div style={{ height: '100vh', backgroundColor: tabColors.background, color: tabColors.text, display: 'flex', flexDirection: 'column' }}>
      {/* Показываем навигацию только если НЕ карта */}
      {!isMapActive && (
        <nav style={{ display: 'flex', justifyContent: 'center', backgroundColor: tabColors.active }}>
          {['account', 'subscription', 'map'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 24px',
                margin: '8px',
                backgroundColor: activeTab === tab ? tabColors.inactive : tabColors.active,
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
          {/* Можно добавить кнопку назад, если нужно */}
          <button
            onClick={() => setActiveTab('account')}
            style={{
              position: 'absolute',
              top: 15,
              right: 10,
              zIndex: 1000,
              padding: '8px 12px',
              backgroundColor: '#ffffff',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              boxShadow: '0 0 6px rgba(0,0,0,0.3)',
            }}
          >
            ← Назад
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
