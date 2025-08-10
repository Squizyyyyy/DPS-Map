import React, { useEffect, useState } from 'react';

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handler(e) {
      e.preventDefault(); // блокируем авто-предложение
      setDeferredPrompt(e);
      setVisible(true);
    }
    window.addEventListener('beforeinstallprompt', handler);

    // если уже установлен, скрываем
    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null);
      setVisible(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', () => {});
    };
  }, []);

  const onClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      console.log('Пользователь установил приложение');
    } else {
      console.log('Пользователь отказался от установки');
    }
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 2000,
        background: '#317EFB',
        color: '#fff',
        border: 'none',
        padding: '12px 16px',
        borderRadius: 10,
        fontSize: 16,
        boxShadow: '0 6px 18px rgba(0,0,0,0.15)'
      }}
    >
      📱 Установить DPS Map
    </button>
  );
}
