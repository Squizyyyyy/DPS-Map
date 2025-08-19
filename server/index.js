const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------- MongoDB ----------------------
const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);
let markersCollection;
let actionsCollection;
let usersCollection;

app.use(cors());
app.use(express.json());

// ---------------------- JWT secret ----------------------
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// ---------------------- Connect to MongoDB ----------------------
async function startServer() {
  try {
    await client.connect();
    const db = client.db('dps-map');
    markersCollection = db.collection('markers');
    actionsCollection = db.collection('actions');
    usersCollection = db.collection('users');

    await actionsCollection.createIndex({ ip: 1, action: 1 }, { unique: true });

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

// ---------------------- JWT Middleware ----------------------
function authenticateJWT(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.sendStatus(403);
  }
}

// ---------------------- VK OAuth ----------------------
app.post('/auth/vk', async (req, res) => {
  const { code, redirect_uri } = req.body;
  if (!code || !redirect_uri) return res.status(400).json({ error: 'No code or redirect_uri' });

  try {
    // Обмен кода на access_token
    const tokenRes = await fetch(`https://oauth.vk.com/access_token?client_id=${process.env.VK_CLIENT_ID}&client_secret=${process.env.VK_CLIENT_SECRET}&redirect_uri=${redirect_uri}&code=${code}`);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.status(400).json({ error: 'VK token exchange failed', details: tokenData });

    const vkRes = await fetch(`https://api.vk.com/method/users.get?user_ids=${tokenData.user_id}&access_token=${tokenData.access_token}&v=5.131`);
    const data = await vkRes.json();
    if (!data.response) return res.status(400).json({ error: 'VK API failed', details: data });

    const vkUser = data.response[0];
    let user = await usersCollection.findOne({ vkId: vkUser.id });
    if (!user) {
      user = {
        vkId: vkUser.id,
        name: `${vkUser.first_name} ${vkUser.last_name}`,
        createdAt: Date.now(),
      };
      await usersCollection.insertOne(user);
      user._id = user._id || ObjectId(); // чтобы JWT корректно сработал
    }

    const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'VK login error' });
  }
});

// ---------------------- Telegram OAuth ----------------------
app.post('/auth/telegram', async (req, res) => {
  const { id, first_name, last_name, username } = req.body;
  if (!id) return res.status(400).json({ error: 'No Telegram user data' });

  let user = await usersCollection.findOne({ telegramId: id });
  if (!user) {
    user = {
      telegramId: id,
      name: first_name + (last_name ? ` ${last_name}` : ''),
      username,
      createdAt: Date.now(),
    };
    await usersCollection.insertOne(user);
    user._id = user._id || ObjectId();
  }

  const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

// ---------------------- Helper Functions ----------------------
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
    return [house_number, road, suburb || neighbourhood, city || town].filter(Boolean).join(', ');
  } catch (error) {
    console.error('Ошибка получения адреса:', error);
    return 'Адрес не найден';
  }
}

async function checkRateLimit(ip, action) {
  const now = Date.now();
  const limitMs = 5 * 60 * 1000; // 5 минут
  const record = await actionsCollection.findOne({ ip, action });

  if (record && now - record.timestamp < limitMs) return false;

  await actionsCollection.updateOne(
    { ip, action },
    { $set: { timestamp: now } },
    { upsert: true }
  );

  return true;
}

function getClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  return req.socket.remoteAddress;
}

// ---------------------- Marker Routes ----------------------
app.get('/markers', async (req, res) => {
  const allMarkers = await markersCollection.find().toArray();
  res.json(allMarkers);
});

app.post('/markers', authenticateJWT, async (req, res) => {
  const ip = getClientIp(req);
  const allowed = await checkRateLimit(ip, 'add');
  if (!allowed) return res.status(429).json({ error: 'Слишком частое добавление. Попробуйте позже.' });

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

app.post('/markers/:id/confirm', authenticateJWT, async (req, res) => {
  const id = Number(req.params.id);
  const marker = await markersCollection.findOne({ id });
  if (!marker) return res.sendStatus(404);

  await markersCollection.updateOne(
    { id },
    {
      $set: { status: 'active', timestamp: Date.now() },
      $inc: { confirmations: 1 },
    }
  );

  res.sendStatus(200);
});

app.post('/markers/:id/delete', authenticateJWT, async (req, res) => {
  const ip = getClientIp(req);
  const allowed = await checkRateLimit(ip, 'delete');
  if (!allowed) return res.status(429).json({ error: 'Слишком частое удаление. Попробуйте позже.' });

  const id = Number(req.params.id);
  const result = await markersCollection.deleteOne({ id });
  if (result.deletedCount > 0) res.sendStatus(200);
  else res.sendStatus(404);
});

// ---------------------- Auto-update markers ----------------------
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

    if (updateNeeded) console.log(`🕒 Обновлена/удалена метка ${marker.id}`);
  }
}, 30 * 1000);

// ---------------------- Serve frontend ----------------------
app.use(express.static(path.join(__dirname, '../build')));

app.get(/^\/(?!markers|auth).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../build/index.html'));
});
