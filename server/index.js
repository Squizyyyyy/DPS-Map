const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB
const MONGO_URI = 'mongodb+srv://danilkrauyshin2:Squizyzerofox1221.@dps-cluster.wj56qe5.mongodb.net/?retryWrites=true&w=majority&appName=DPS-Cluster';
const client = new MongoClient(MONGO_URI);
let markersCollection;
let actionsCollection;  // Для хранения времени последних действий по IP

app.use(cors());
app.use(express.json());

// Подключение к MongoDB и запуск сервера
async function startServer() {
  try {
    await client.connect();
    const db = client.db('dps-map');
    markersCollection = db.collection('markers');
    actionsCollection = db.collection('actions'); // новая коллекция
    console.log('✅ Подключено к MongoDB');

    // Создаем индекс для быстрого поиска по IP и действию
    await actionsCollection.createIndex({ ip: 1, action: 1 }, { unique: true });

    app.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Ошибка подключения к MongoDB:', err);
    process.exit(1);
  }
}

startServer();

// Получение укороченного адреса
async function getAddress(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DPS-Map-App/1.0 (valerka.korsh@gmail.com)',
        'Accept-Language': 'ru',
      },
    });
    const data = await response.json();

    if (!data.address) return 'Адрес не найден';

    const { house_number, road, suburb, neighbourhood, city, town } = data.address;

    return [
      house_number,
      road,
      suburb || neighbourhood,
      city || town
    ].filter(Boolean).join(', ');

  } catch (error) {
    console.error('Ошибка получения адреса:', error);
    return 'Адрес не найден';
  }
}

// Проверка ограничений по IP и действию (add или delete)
async function checkRateLimit(ip, action) {
  const now = Date.now();
  const limitMs = 5 * 60 * 1000; // 5 минут

  // Ищем последнюю запись о действии этого IP
  const record = await actionsCollection.findOne({ ip, action });

  if (record && now - record.timestamp < limitMs) {
    // Если прошло меньше 5 минут — запрещаем
    return false;
  }

  // Обновляем или вставляем новую запись
  await actionsCollection.updateOne(
    { ip, action },
    { $set: { timestamp: now } },
    { upsert: true }
  );

  return true;
}

// Автообновление меток — без изменений
setInterval(async () => {
  const now = Date.now();
  const allMarkers = await markersCollection.find().toArray();

  for (const marker of allMarkers) {
    const age = now - marker.timestamp;
    let updateNeeded = false;

    if (marker.status === 'active' && age > 60 * 60 * 1000) {
      await markersCollection.updateOne({ id: marker.id }, { $set: { status: 'stale' } });
      updateNeeded = true;
    }

    if (marker.status === 'stale' && age > 80 * 60 * 1000) {
      await markersCollection.deleteOne({ id: marker.id });
      updateNeeded = true;
    }

    if (updateNeeded) {
      console.log(`🕒 Обновлена/удалена метка ${marker.id}`);
    }
  }
}, 30 * 1000);

// API: Получить все метки
app.get('/markers', async (req, res) => {
  const allMarkers = await markersCollection.find().toArray();
  res.json(allMarkers);
});

// API: Добавить метку
app.post('/markers', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  const allowed = await checkRateLimit(ip, 'add');
  if (!allowed) {
    return res.status(429).json({ error: 'Слишком частое добавление. Попробуйте позже.' });
  }

  let { lat, lng, comment } = req.body;
  if (!comment || comment.trim() === '') comment = '-';

  const id = Date.now();
  const address = await getAddress(lat, lng);

  const marker = {
    id,
    lat,
    lng,
    timestamp: Date.now(),
    status: 'active',
    confirmations: 0,
    address,
    comment,
  };

  await markersCollection.insertOne(marker);
  res.json(marker);
});

// API: Подтверждение метки — без изменений
app.post('/markers/:id/confirm', async (req, res) => {
  const id = Number(req.params.id);
  const marker = await markersCollection.findOne({ id });

  if (!marker) return res.sendStatus(404);

  await markersCollection.updateOne(
    { id },
    {
      $set: {
        status: 'active',
        timestamp: Date.now(),
      },
      $inc: { confirmations: 1 },
    }
  );

  res.sendStatus(200);
});

// API: Удаление метки
app.post('/markers/:id/delete', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  const allowed = await checkRateLimit(ip, 'delete');
  if (!allowed) {
    return res.status(429).json({ error: 'Слишком частое удаление. Попробуйте позже.' });
  }

  const id = Number(req.params.id);
  const result = await markersCollection.deleteOne({ id });

  if (result.deletedCount > 0) {
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Отдача фронтенда — без изменений
app.use(express.static(path.join(__dirname, '../build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build/index.html'));
});
