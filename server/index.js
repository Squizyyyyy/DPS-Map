import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import session from "express-session";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";

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
      // Для разных доменов/HTTPS раскомментируй:
      // sameSite: "none",
      // secure: true,
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

// ---- Парсим ID Token (JWT) без валидации подписи (для прототипа) ----
function parseIdToken(idToken) {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    return payload;
  } catch (e) {
    return null;
  }
}

// ---- Маппинг claim'ов в наш объект пользователя ----
function mapClaimsToUser(claims) {
  // OIDC-подобные поля: sub, given_name, family_name, name, picture, email
  const id = claims?.sub || claims?.uid || null;
  const firstName = claims?.given_name || claims?.first_name || null;
  const lastName = claims?.family_name || claims?.last_name || null;
  const photo = claims?.picture || claims?.photo_100 || null;
  return {
    id,
    info: {
      first_name: firstName || "",
      last_name: lastName || "",
      photo_100: photo || "",
    },
    email: claims?.email || null,
  };
}

// ---------------------- VKID Authentication ----------------------

// Middleware для защиты роутов
function checkAuth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: "Не авторизован" });
}

// POST /auth/vkid — принимаем токены, собираем профиль из id_token и создаём сессию
app.post("/auth/vkid", async (req, res) => {
  try {
    const { access_token, refresh_token, id_token } = req.body || {};
    if (!access_token) {
      return res.status(400).json({ success: false, error: "Нет access_token" });
    }

    // Пытаемся извлечь профиль из id_token
    let userObj = null;
    if (id_token) {
      const claims = parseIdToken(id_token);
      if (claims) {
        const mapped = mapClaimsToUser(claims);
        if (mapped.id) {
          userObj = {
            ...mapped,
            internalId: uuidv4(),
            access_token,
            refresh_token: refresh_token || null,
            id_token,
          };
        }
      }
    }

    // Если вдруг id_token пустой/без нужных полей — всё равно создаём «минимального» юзера
    if (!userObj) {
      userObj = {
        id: `vk_${Math.random().toString(36).slice(2)}`, // временный ID (лучше иметь sub из id_token)
        internalId: uuidv4(),
        info: { first_name: "", last_name: "", photo_100: "" },
        email: null,
        access_token,
        refresh_token: refresh_token || null,
        id_token: id_token || null,
      };
    }

    // Сохраняем пользователя и сессию
    req.session.user = userObj;
    await usersCollection.updateOne({ id: userObj.id }, { $set: userObj }, { upsert: true });

    return res.json({ success: true, user: userObj });
  } catch (e) {
    console.error("VKID auth error:", e);
    return res.status(500).json({ success: false, error: "Серверная ошибка при авторизации" });
  }
});

// ---------------------- Auth Status / Logout ----------------------
app.get("/auth/status", (req, res) => {
  if (req.session.user) res.json({ authorized: true, user: req.session.user });
  else res.json({ authorized: false });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
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
    { $set: { status: "active", timestamp: Date.now() }, $inc: { confirmations: 1 } }
  );
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

// ---------------------- Serve frontend ----------------------
app.use(express.static(path.join(__dirname, "../build")));
app.get(/^\/(?!markers|auth).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../build/index.html"));
});
