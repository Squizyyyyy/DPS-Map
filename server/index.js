const express = require('express');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const DATA_FILE = './markers.json';
let markers = [];
const deleteTimestamps = {}; // IP → время последнего удаления
const addTimestamps = {};    // IP → время последнего добавления

// Загрузка при запуске
if (fs.existsSync(DATA_FILE)) {
  markers = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

// Сохранение в файл
const saveMarkers = () => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(markers, null, 2));
};

// Получение адреса по координатам
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

// Автообновление: старение и удаление
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

// Получить все метки
app.get('/markers', (req, res) => {
  res.json(markers);
});

// Добавить метку (ограничение: не чаще 1 раза в 5 минут с одного IP)
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

// Подтвердить метку
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

// Удалить метку (ограничение: не чаще 1 раза в 5 минут с одного IP)
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

// Старт сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
