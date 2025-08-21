// server/index.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import fetch from "node-fetch";
import dotenv from "dotenv";
import session from "express-session";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------- MongoDB ----------------------
const MONGO_URI = process.env.MONGO_URI;
const client = new MongoClient(MONGO_URI);
let markersCollection;
let actionsCollection;

// ---------------------- Middlewares ----------------------
app.use(cors());
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
  })
);

// ---------------------- Start Server ----------------------
async function startServer() {
  try {
    await client.connect();
    const db = client.db("dps-map");
    markersCollection = db.collection("markers");
    actionsCollection = db.collection("actions");

    await actionsCollection.createIndex({ ip: 1, action: 1 }, { unique: true });

    console.log("✅ Подключено к MongoDB");

    app.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Ошибка подключения к MongoDB:", err);
    process.exit(1);
  }
}

startServer();

// ---------------------- Helpers ----------------------
async function getAddress(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "DPS-Map-App/1.0",
        "Accept-Language": "ru",
      },
    });
    const data = await response.json();
    if (!data.address) return "Адрес не найден";

    const { house_number, road, suburb, neighbourhood, city, town } = data.address;
    return [house_number, road, suburb || neighbourhood, city || town].filter(Boolean).join(", ");
  } catch (error) {
    console.error("Ошибка получения адреса:", error);
    return "Адрес не найден";
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
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (xForwardedFor) return xForwardedFor.split(",")[0].trim();
  return req.socket.remoteAddress;
}

// ---------------------- VK Authorization ----------------------
const VK_CLIENT_ID = process.env.VK_CLIENT_ID;
const VK_CLIENT_SECRET = process.env.VK_CLIENT_SECRET;
const VK_REDIRECT_URI = process.env.VK_REDIRECT_URI; // https://yourdomain.com/auth/vk/callback

// Middleware для защиты роутов
function checkAuth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: "Не авторизован" });
}

// Редирект на VK для авторизации
app.get("/auth/vk", (req, res) => {
  const url = `https://oauth.vk.com/authorize?client_id=${VK_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    VK_REDIRECT_URI
  )}&response_type=code&scope=email`;
  res.redirect(url);
});

// Callback VK после авторизации
app.get("/auth/vk/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Нет кода авторизации");

  try {
    // Получаем access_token
    const tokenResp = await fetch(
      `https://oauth.vk.com/access_token?client_id=${VK_CLIENT_ID}&client_secret=${VK_CLIENT_SECRET}&redirect_uri=${encodeURIComponent(
        VK_REDIRECT_URI
      )}&code=${code}`
    );
    const tokenData = await tokenResp.json();

    if (tokenData.error) return res.status(400).json(tokenData);

    // Получаем информацию о пользователе
    const userResp = await fetch(
      `https://api.vk.com/method/users.get?user_ids=${tokenData.user_id}&fields=photo_100,email&access_token=${tokenData.access_token}&v=5.131`
    );
    const userData = await userResp.json();

    // Сохраняем в сессии
    req.session.user = {
      id: tokenData.user_id,
      email: tokenData.email,
      info: userData.response[0],
    };

    // Редирект на frontend (главную страницу)
    res.redirect("/");
  } catch (err) {
    console.error("VK Auth Error:", err);
    res.status(500).send("Ошибка авторизации VK");
  }
});

// Роут для проверки авторизации
app.get("/auth/status", (req, res) => {
  if (req.session.user) res.json({ authenticated: true, user: req.session.user });
  else res.json({ authenticated: false });
});

// ---------------------- Marker Routes (защищенные) ----------------------
app.get("/markers", checkAuth, async (req, res) => {
  const allMarkers = await markersCollection.find().toArray();
  res.json(allMarkers);
});

app.post("/markers", checkAuth, async (req, res) => {
  const ip = getClientIp(req);
  const allowed = await checkRateLimit(ip, "add");
  if (!allowed) return res.status(429).json({ error: "Слишком частое добавление. Попробуйте позже." });

  let { lat, lng, comment } = req.body;
  if (!comment || comment.trim() === "") comment = "-";

  const id = Date.now();
  const address = await getAddress(lat, lng);

  const marker = {
    id,
    lat,
    lng,
    timestamp: Date.now(),
    status: "active",
    confirmations: 0,
    address,
    comment,
  };

  await markersCollection.insertOne(marker);
  res.json(marker);
});

app.post("/markers/:id/confirm", checkAuth, async (req, res) => {
  const id = Number(req.params.id);
  const marker = await markersCollection.findOne({ id });
  if (!marker) return res.sendStatus(404);

  await markersCollection.updateOne(
    { id },
    {
      $set: { status: "active", timestamp: Date.now() },
      $inc: { confirmations: 1 },
    }
  );

  res.sendStatus(200);
});

app.post("/markers/:id/delete", checkAuth, async (req, res) => {
  const ip = getClientIp(req);
  const allowed = await checkRateLimit(ip, "delete");
  if (!allowed) return res.status(429).json({ error: "Слишком частое удаление. Попробуйте позже." });

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

    if (marker.status === "active" && age > 60 * 60 * 1000) {
      await markersCollection.updateOne({ id: marker.id }, { $set: { status: "stale" } });
      updateNeeded = true;
    }

    if (marker.status === "stale" && age > 80 * 60 * 1000) {
      await markersCollection.deleteOne({ id: marker.id });
      updateNeeded = true;
    }

    if (updateNeeded) console.log(`🕒 Обновлена/удалена метка ${marker.id}`);
  }
}, 30 * 1000);

// ---------------------- Serve frontend ----------------------
app.use(express.static(path.join(__dirname, "../build")));

app.get(/^\/(?!markers|auth).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../build/index.html"));
});
