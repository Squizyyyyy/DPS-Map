import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import fetch from "node-fetch";
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
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
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

// ---------------------- VK ID Authentication ----------------------
const VK_APP_ID = process.env.VK_CLIENT_ID;
const VK_REDIRECT_URI = process.env.VK_REDIRECT_URI;

// Middleware для защиты роутов
function checkAuth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: "Не авторизован" });
}

// ---------------------- VK Routes ----------------------
app.post("/auth/vk/start", (req, res) => {
  const { code_challenge } = req.body;
  if (!code_challenge) return res.status(400).json({ error: "code_challenge отсутствует" });

  const params = new URLSearchParams({
    client_id: VK_APP_ID,
    redirect_uri: VK_REDIRECT_URI,
    response_type: "code",
    scope: "email",
    code_challenge,
    code_challenge_method: "S256",
  });

  res.json({ url: `https://id.vk.com/authorize?${params.toString()}` });
});

app.post("/auth/vk/exchange", async (req, res) => {
  const { code, code_verifier } = req.body;
  if (!code || !code_verifier) return res.status(400).json({ error: "code или code_verifier отсутствует" });

  try {
    // ✅ Новый VK ID PKCE endpoint
    const tokenResp = await fetch("https://id.vk.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: VK_APP_ID,
        redirect_uri: VK_REDIRECT_URI,
        code_verifier,
      }),
    });

    const tokenText = await tokenResp.text();
    console.log("VK Token Response Text:", tokenText);

    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch (e) {
      console.error("VK Token Parse Error:", e);
      return res.status(500).json({ error: "Не удалось распарсить ответ VK", raw: tokenText });
    }

    if (tokenData.error) {
      console.error("VK Token Error:", tokenData);
      return res.status(400).json(tokenData);
    }

    // ✅ Разбираем id_token (JWT), чтобы достать user_id (sub)
    let userId = null;
    if (tokenData.id_token) {
      try {
        const payload = JSON.parse(Buffer.from(tokenData.id_token.split(".")[1], "base64").toString());
        userId = payload.sub;
      } catch (e) {
        console.error("Ошибка разбора id_token:", e);
      }
    }

    if (!userId) {
      return res.status(400).json({ error: "Не удалось получить user_id из VK ID" });
    }

    const userObj = {
      id: userId,
      internalId: uuidv4(),
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
    };

    req.session.user = userObj;

    await usersCollection.updateOne(
      { id: userObj.id },
      { $set: userObj },
      { upsert: true }
    );

    res.json({ success: true, user: userObj });
  } catch (err) {
    console.error("VK ID Exchange Error:", err);
    res.status(500).json({ error: "Ошибка VK ID" });
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

// ---------------------- Serve frontend ----------------------
app.use(express.static(path.join(__dirname, "../build")));
app.get(/^\/(?!markers|auth).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../build/index.html"));
});
