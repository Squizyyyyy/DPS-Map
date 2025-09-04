import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import session from "express-session";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";
import crypto from "crypto";

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
let usersCollection;

// ---------------------- Middlewares ----------------------
app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

// ---------------------- Start Server ----------------------
async function startServer() {
  try {
    await client.connect();
    const db = client.db("dps-map");
    markersCollection = db.collection("markers");
    actionsCollection = db.collection("actions");
    usersCollection = db.collection("users");

    await actionsCollection.createIndex({ ip: 1, action: 1 }, { unique: true });
    await usersCollection.createIndex({ id: 1 }, { unique: true });

    console.log("✅ Подключено к MongoDB");

    setInterval(updateMarkersStatus, 5 * 60 * 1000);

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
      headers: { "User-Agent": "DPS-Map-App/1.0", "Accept-Language": "ru" },
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
  const limitMs = 5 * 60 * 1000;
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
  return xForwardedFor ? xForwardedFor.split(",")[0].trim() : req.socket.remoteAddress;
}

function parseIdToken(idToken) {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
  } catch (e) {
    return null;
  }
}

function mapClaimsToUser(claims) {
  const id = claims?.sub || claims?.uid || null;
  const firstName = claims?.given_name || claims?.first_name || "";
  const lastName = claims?.family_name || claims?.last_name || "";
  const photo = claims?.picture || claims?.photo_100 || "";
  return {
    id,
    info: { first_name: firstName, last_name: lastName, photo_100: photo },
    email: claims?.email || null,
  };
}

// ---------------------- Auth Middleware ----------------------
async function checkAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Не авторизован" });

  const userInDb = await usersCollection.findOne({ id: req.session.user.id });
  if (!userInDb) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Пользователь не найден" });
  }

  req.session.user = userInDb;
  next();
}

// ---------------------- Refresh Token ----------------------
async function refreshAccessToken(user) {
  if (!user?.refresh_token) return user.access_token;

  try {
    const response = await fetch("https://api.vk.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: user.refresh_token,
        client_id: process.env.VK_APP_ID,
        client_secret: process.env.VK_APP_SECRET,
      }),
    });

    const data = await response.json();
    if (data.access_token) {
      user.access_token = data.access_token;
      if (data.refresh_token) user.refresh_token = data.refresh_token;
      await usersCollection.updateOne(
        { id: user.id },
        { $set: { access_token: user.access_token, refresh_token: user.refresh_token } }
      );
      return user.access_token;
    }
    return user.access_token;
  } catch (e) {
    console.error("Ошибка обновления access token:", e);
    return user.access_token;
  }
}

// ---------------------- Auth Routes ----------------------
// ---- VKID ----
app.post("/auth/vkid", async (req, res) => {
  try {
    const { access_token, refresh_token, id_token } = req.body || {};
    if (!access_token) return res.status(400).json({ success: false, error: "Нет access_token" });

    let userObj = null;
    if (id_token) {
      const claims = parseIdToken(id_token);
      if (claims) userObj = mapClaimsToUser(claims);
    }

    if (!userObj || !userObj.id) {
      userObj = {
        id: `vk_${Math.random().toString(36).slice(2)}`,
        info: { first_name: "", last_name: "", photo_100: "" },
        email: null,
      };
    }

    const existingUser = await usersCollection.findOne({ id: userObj.id });
    if (existingUser) {
      userObj = { ...existingUser, access_token, refresh_token, id_token };
    } else {
      userObj = { ...userObj, internalId: uuidv4(), access_token, refresh_token, id_token };
      await usersCollection.insertOne(userObj);
    }

    req.session.user = userObj;
    await usersCollection.updateOne({ id: userObj.id }, { $set: userObj }, { upsert: true });

    return res.json({ success: true, user: userObj });
  } catch (e) {
    console.error("VKID auth error:", e);
    return res.status(500).json({ success: false, error: "Серверная ошибка при авторизации" });
  }
});

// ---- Telegram ----
app.post("/auth/telegram", async (req, res) => {
  try {
    const { id, first_name, last_name, username, photo_url, auth_date, hash } = req.body;
    if (!id || !hash) return res.status(400).json({ success: false, error: "Недостаточно данных" });

    const secret = crypto.createHash("sha256").update(process.env.TELEGRAM_BOT_TOKEN).digest();
    const checkString = Object.keys(req.body).filter(k => k !== "hash").sort().map(k => `${k}=${req.body[k]}`).join("\n");
    const hmac = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
    if (hmac !== hash) return res.status(403).json({ success: false, error: "Неверная подпись Telegram" });

    let userObj = {
      id: `tg_${id}`,
      info: { first_name: first_name || "", last_name: last_name || "", username: username || "", photo_100: photo_url || "" },
      telegram: { id, username, auth_date },
    };

    const existingUser = await usersCollection.findOne({ id: userObj.id });
    if (existingUser) {
      userObj = { ...existingUser, telegram: userObj.telegram };
    } else {
      userObj.internalId = uuidv4();
      await usersCollection.insertOne(userObj);
    }

    req.session.user = userObj;
    await usersCollection.updateOne({ id: userObj.id }, { $set: userObj }, { upsert: true });

    return res.json({ success: true, user: userObj });
  } catch (e) {
    console.error("Telegram auth error:", e);
    return res.status(500).json({ success: false, error: "Серверная ошибка при авторизации" });
  }
});

// ---- Проверка сессии ----
app.get("/auth/status", async (req, res) => {
  if (!req.session.user) return res.json({ authorized: false });

  let userInDb = await usersCollection.findOne({ id: req.session.user.id });
  if (!userInDb) {
    req.session.destroy(() => {});
    return res.json({ authorized: false });
  }

  // Проверка подписки
  if (userInDb.subscription?.expiresAt) {
    userInDb.subscription.active = Date.now() <= userInDb.subscription.expiresAt;
    await usersCollection.updateOne({ id: userInDb.id }, { $set: { subscription: userInDb.subscription } });
  }

  // Обновляем токены
  if (userInDb.refresh_token) {
    userInDb.access_token = await refreshAccessToken(userInDb);
  }

  req.session.user = userInDb;
  return res.json({ authorized: true, user: userInDb });
});

// ---- Logout ----
app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ---- Сохранение города ----
app.post("/auth/set-city", checkAuth, async (req, res) => {
  try {
    const { city } = req.body;
    if (!city || typeof city !== "string") return res.status(400).json({ success: false, error: "Неверный город" });

    const user = req.session.user;
    user.city = city;
    await usersCollection.updateOne({ id: user.id }, { $set: { city } });
    req.session.user = user;

    res.json({ success: true, city });
  } catch (err) {
    console.error("Ошибка при сохранении города:", err);
    res.status(500).json({ success: false, error: "Серверная ошибка при сохранении города" });
  }
});

// ---- Подписка ----
app.post("/subscription/buy", checkAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    user.subscription = { active: true, plan: "basic", expiresAt };
    await usersCollection.updateOne({ id: user.id }, { $set: { subscription: user.subscription } });
    req.session.user = user;
    res.json({ success: true, subscription: user.subscription });
  } catch (e) {
    console.error("Ошибка при покупке подписки:", e);
    res.status(500).json({ success: false, error: "Серверная ошибка при покупке подписки" });
  }
});

// ---------------------- Marker Routes ----------------------
app.get("/markers", checkAuth, async (req, res) => {
  const allMarkers = await markersCollection.find().toArray();
  res.json(allMarkers);
});

app.post("/markers", checkAuth, async (req, res) => {
  const ip = getClientIp(req);
  const allowed = await checkRateLimit(ip, "add");
  if (!allowed) return res.status(429).json({ error: "Слишком частое добавление" });

  let { lat, lng, comment } = req.body;
  if (!comment || comment.trim() === "") comment = "-";

  const id = Date.now();
  const address = await getAddress(lat, lng);

  const marker = { id, lat, lng, timestamp: Date.now(), status: "active", confirmations: 0, address, comment };
  await markersCollection.insertOne(marker);
  res.json(marker);
});

app.post("/markers/:id/confirm", checkAuth, async (req, res) => {
  const id = Number(req.params.id);
  const marker = await markersCollection.findOne({ id });
  if (!marker) return res.sendStatus(404);
  await markersCollection.updateOne({ id }, { $set: { status: "active", timestamp: Date.now() }, $inc: { confirmations: 1 } });
  res.sendStatus(200);
});

app.post("/markers/:id/delete", checkAuth, async (req, res) => {
  const ip = getClientIp(req);
  const allowed = await checkRateLimit(ip, "delete");
  if (!allowed) return res.status(429).json({ error: "Слишком частое удаление" });

  const id = Number(req.params.id);
  const result = await markersCollection.deleteOne({ id });
  if (result.deletedCount > 0) res.sendStatus(200);
  else res.sendStatus(404);
});

// ---------------------- Автообновление статуса меток ----------------------
async function updateMarkersStatus() {
  try {
    const now = Date.now();
    await markersCollection.updateMany({ status: "active", timestamp: { $lt: now - 60 * 60 * 1000 } }, { $set: { status: "unconfirmed" } });
    await markersCollection.deleteMany({ timestamp: { $lt: now - 90 * 60 * 1000 } });
    console.log("🔄 Проверка меток выполнена");
  } catch (err) {
    console.error("Ошибка обновления статусов меток:", err);
  }
}

// ---------------------- Serve frontend ----------------------
app.use(express.static(path.join(__dirname, "../build")));
app.get(/^\/(?!markers|auth|subscription).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../build/index.html"));
});