const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5000;

const DATA_FILE = './markers.json';
let markers = [];
const deleteTimestamps = {};
const addTimestamps = {};

// ===== Загрузка меток при запуске =====
if (fs.existsSync(DATA_FILE)) {
  markers = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

// ===== Сохранение в файл =====
const saveMarkers = () => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(markers, null, 2));
};

// ===== Получение адреса по координатам =====
async function getAddress(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DPS-Map-App/1.0 (valerka.korsh@gmail.com)',
        'Accept-Language': 'ru',
      },
    });
    const data = await response.json();
    return data.display_name || 'Адрес не найден';
  } catch (error) {
    console.error('Ошибка получения адреса:', error);
    return 'Адрес не найден';
  }
}

// ===== Автоматическое обновление статуса меток =====
setInterval(() => {
  const now = Date.now();
  let changed = false;

  markers.forEach((marker) => {
    const age = now - marker.timestamp;

    if (marker.status === 'active' && age > 60 * 60 * 1000) {
      marker.status = 'stale';
      changed = true;
    }

    if (marker.status === 'stale' && age > 80 * 60 * 1000) {
      changed = true;
    }
  });

  const before = markers.length;
  markers = markers.filter(
    (m) => !(m.status === 'stale' && now - m.timestamp > 80 * 60 * 1000)
  );
  if (before !== markers.length) changed = true;

  if (changed) saveMarkers();
}, 30 * 1000);

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== API =====
app.get('/markers', (req, res) => {
  res.json(markers);
});

app.post('/markers', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();

  if (addTimestamps[ip] && now - addTimestamps[ip] < 5 * 60 * 1000) {
    return res.status(429).json({ error: 'Слишком частое добавление. Попробуйте позже.' });
  }

  addTimestamps[ip] = now;

  const { lat, lng } = req.body;
  const id = Date.now();
  const address = await getAddress(lat, lng);

  console.log('Добавлена метка с адресом:', address);

  const marker = {
    id,
    lat,
    lng,
    timestamp: Date.now(),
    status: 'active',
    confirmations: 0,
    address,
  };

  markers.push(marker);
  saveMarkers();
  res.json(marker);
});

app.post('/markers/:id/confirm', (req, res) => {
  const id = Number(req.params.id);
  const marker = markers.find((m) => m.id === id);
  if (marker) {
    marker.status = 'active';
    marker.timestamp = Date.now();
    marker.confirmations += 1;
    saveMarkers();
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

app.post('/markers/:id/delete', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();

  if (deleteTimestamps[ip] && now - deleteTimestamps[ip] < 5 * 60 * 1000) {
    return res.status(429).json({ error: 'Слишком частое удаление. Попробуйте позже.' });
  }

  deleteTimestamps[ip] = now;

  const id = Number(req.params.id);
  const prevLen = markers.length;
  markers = markers.filter((m) => m.id !== id);

  if (markers.length !== prevLen) {
    saveMarkers();
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// ===== Отдача React-фронта из папки build =====
app.use(express.static(path.join(__dirname, '../build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

// ===== Запуск сервера =====
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
