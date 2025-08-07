const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { MongoClient } = require('mongodb');
const fetch = require('node-fetch'); // если не установлен — установи через npm
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB
const MONGO_URI = 'mongodb+srv://danilkrauyshin2:Squizyzerofox1221.@dps-cluster.wj56qe5.mongodb.net/?retryWrites=true&w=majority&appName=DPS-Cluster';
const client = new MongoClient(MONGO_URI);
let markersCollection;

const deleteTimestamps = {};
const addTimestamps = {};

app.use(cors());
app.use(express.json());

// Подключение к MongoDB и запуск сервера
async function startServer() {
  try {
    await client.connect();
    const db = client.db('dps-map');
    markersCollection = db.collection('markers');
    console.log('✅ Подключено к MongoDB');

    app.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Ошибка подключения к MongoDB:', err);
    process.exit(1);
  }
}

startServer();

// Получение адреса
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

// Автообновление
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
  const now = Date.now();

  if (addTimestamps[ip] && now - addTimestamps[ip] < 5 * 60 * 1000) {
    return res.status(429).json({ error: 'Слишком частое добавление. Попробуйте позже.' });
  }

  addTimestamps[ip] = now;

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

// API: Подтверждение метки
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
  const now = Date.now();

  if (deleteTimestamps[ip] && now - deleteTimestamps[ip] < 5 * 60 * 1000) {
    return res.status(429).json({ error: 'Слишком частое удаление. Попробуйте позже.' });
  }

  deleteTimestamps[ip] = now;

  const id = Number(req.params.id);
  const result = await markersCollection.deleteOne({ id });

  if (result.deletedCount > 0) {
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// Отдача фронтенда
app.use(express.static(path.join(__dirname, '../build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build/index.html'));
});
