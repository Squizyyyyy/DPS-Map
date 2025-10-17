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
import imaps from "imap-simple";
import { simpleParser } from "mailparser";

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
let paymentsCollection;

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
    paymentsCollection = db.collection("payments");

    await actionsCollection.createIndex({ ip: 1, action: 1 }, { unique: true });
    await usersCollection.createIndex({ id: 1 }, { unique: true });
    await paymentsCollection.createIndex({ sum: 1 }, { unique: true });
    await paymentsCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    console.log("✅ MongoDB подключена, коллекции готовы");

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
  } catch {
    return "Адрес не найден";
  }
}

async function checkRateLimit(ip, action) {
  const now = Date.now();
  const limitMs = 15 * 60 * 1000;
  const record = await actionsCollection.findOne({ ip, action });
  if (record && now - record.timestamp < limitMs) return false;
  await actionsCollection.updateOne({ ip, action }, { $set: { timestamp: now } }, { upsert: true });
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
  } catch {
    return null;
  }
}

function mapClaimsToUser(claims) {
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

// ---------------------- Auth Middleware ----------------------
async function checkAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Не авторизован" });
  const userInDb = await usersCollection.findOne({ id: req.session.user.id });
  if (!userInDb) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Пользователь не найден" });
  }
  next();
}

// ---------------------- Subscription Logic ----------------------
const activePayments = {};

app.post("/subscription/generate-sum", checkAuth, async (req, res) => {
  const user = req.session.user;
  const { plan } = req.body;
  const base = plan === "3m" ? 289 : 99;
  const allCents = Array.from({ length: 99 }, (_, i) => i + 1);

  console.log(`🧾 [${user.id}] Запрос генерации суммы для тарифа: ${plan}`);

  try {
    await paymentsCollection.deleteMany({ expiresAt: { $lt: Date.now() } });
    console.log("🧹 Старые платежи очищены");

    const activeDocs = await paymentsCollection.find({}).toArray();
    const usedCents = activeDocs
      .filter(d => Math.floor(d.sum) === base)
      .map(d => Math.round((d.sum - base) * 100));
    const freeCents = allCents.filter(c => !usedCents.includes(c));

    if (freeCents.length === 0) {
      console.log("⚠️ Нет доступных копеек для суммы");
      return res.status(500).json({ success: false, error: "Нет доступных сумм" });
    }

    const cents = freeCents[Math.floor(Math.random() * freeCents.length)];
    const sum = base + cents / 100;
    const expiresAt = Date.now() + 15 * 60 * 1000;

    console.log(`💰 [${user.id}] Сгенерирована сумма: ${sum.toFixed(2)} ₽ (истекает через 15 минут)`);

    await paymentsCollection.insertOne({ userId: user.id, sum, expiresAt, plan });
    activePayments[user.id] = { sum, plan, expiresAt };

    console.log(`📩 [${user.id}] Запуск проверки писем...`);
    startMailCheck(user.id);

    res.json({ success: true, sum });
  } catch (err) {
    console.error(`❌ [${user.id}] Ошибка генерации суммы:`, err);
    res.status(500).json({ success: false, error: "Ошибка генерации суммы" });
  }
});

function startMailCheck(userId) {
  const intervalMs = 30 * 1000;
  const maxTimeMs = 15 * 60 * 1000;
  const startTime = Date.now();

  console.log(`🔁 [${userId}] Старт цикла проверки почты каждые 30 секунд`);

  const timer = setInterval(async () => {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxTimeMs) {
      clearInterval(timer);
      delete activePayments[userId];
      console.log(`⏱ [${userId}] Проверка почты остановлена — время истекло`);
      return;
    }

    try {
      const user = await usersCollection.findOne({ id: userId });
      if (!user) {
        console.log(`⚠️ [${userId}] Пользователь не найден`);
        clearInterval(timer);
        return;
      }

      const paymentDoc = await paymentsCollection.findOne({ userId });
      if (!paymentDoc) {
        console.log(`⚠️ [${userId}] Нет активного платежа`);
        return;
      }

      const { sum, plan } = paymentDoc;
      console.log(`💸 [${userId}] Ищем письмо с суммой: ${sum.toFixed(2)} ₽`);

      const config = {
        imap: {
          user: process.env.MAILRU_USER,
          password: process.env.MAILRU_PASSWORD,
          host: "imap.mail.ru",
          port: 993,
          tls: true,
          authTimeout: 10000,
        },
      };

      const connection = await imaps.connect(config);
      await connection.openBox("INBOX");

      const searchCriteria = ["UNSEEN"];
      const fetchOptions = { bodies: [""] };
      const messages = await connection.search(searchCriteria, fetchOptions);

      console.log(`📨 [${userId}] Найдено новых писем: ${messages.length}`);

      let found = false;
      let foundUid = null;

      for (const msg of messages) {
        const rawBody = msg.parts.map(p => p.body).join("\n");
        const parsed = await simpleParser(rawBody);
        const body = (parsed.text || parsed.html || "")
          .replace(/\u00A0/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        console.log(`📜 [${userId}] Фрагмент письма:\n${body.slice(0, 500)}\n---`);

        const variants = [
          `${sum.toFixed(2)}`,
          `${sum.toFixed(2).replace(".", ",")}`,
          `${sum.toFixed(2)} ₽`,
          `${sum.toFixed(2).replace(".", ",")} ₽`,
        ];

        const matchedVariant = variants.find(v => body.includes(v));
        if (matchedVariant) {
          found = true;
          foundUid = msg.attributes.uid;
          console.log(`✅ [${userId}] Найдено письмо с суммой "${matchedVariant}"`);
          break;
        }
      }

      if (found && foundUid) {
        console.log(`🗑 [${userId}] Помечаем письмо с UID ${foundUid} на удаление`);
        await connection.addFlags(foundUid, ["\\Deleted"]); 
      }

      // Сразу обновляем подписку до закрытия соединения
      if (found && foundUid) {
        const now = Date.now();
        let additionalMs = plan === "3m" ? 90 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
        let newExpiresAt = now + additionalMs;

        if (user.subscription?.expiresAt && user.subscription.expiresAt > now) {
          newExpiresAt = user.subscription.expiresAt + additionalMs;
          console.log(`⏩ [${userId}] Подписка продлена, добавлено ${plan === "3m" ? "90" : "30"} дней`);
        }

        user.subscription = { active: true, plan, expiresAt: newExpiresAt };
        await usersCollection.updateOne({ id: user.id }, { $set: { subscription: user.subscription } });
        await paymentsCollection.deleteOne({ userId });
        delete activePayments[userId];
        clearInterval(timer);

        console.log(`🎉 [${userId}] Подписка активирована до ${new Date(newExpiresAt).toLocaleString()}`);
      } else {
        console.log(`❌ [${userId}] Письмо с суммой ${sum.toFixed(2)} ₽ не найдено`);
      }

      // Закрываем соединение и удаляем помеченные письма
      await connection.closeBox(true);
      await connection.end();
    } catch (err) {
      console.error(`🚨 [${userId}] Ошибка при проверке писем:`, err.message);
    }
  }, intervalMs);
}

// ---- Функция для автообновления access token ----
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
      await usersCollection.updateOne({ id: user.id }, { $set: user });
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

    if (!userObj) {
      userObj = {
        id: `vk_${Math.random().toString(36).slice(2)}`,
        internalId: uuidv4(),
        info: { first_name: "", last_name: "", photo_100: "" },
        email: null,
        access_token,
        refresh_token: refresh_token || null,
        id_token: id_token || null,
      };
    }

    //  Сохраняем старые данные (город, подписка), если пользователь уже есть
    const existingUser = await usersCollection.findOne({ id: userObj.id });
    if (existingUser) {
      userObj.city = existingUser.city || userObj.city;
      userObj.subscription = existingUser.subscription || userObj.subscription;
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

    if (!id || !hash) {
      return res.status(400).json({ success: false, error: "Недостаточно данных" });
    }

    // Проверяем подпись
    const secret = crypto.createHash("sha256").update(process.env.TELEGRAM_BOT_TOKEN).digest();
    const checkString = Object.keys(req.body)
      .filter((key) => key !== "hash")
      .sort()
      .map((key) => `${key}=${req.body[key]}`)
      .join("\n");
    const hmac = crypto.createHmac("sha256", secret).update(checkString).digest("hex");

    if (hmac !== hash) {
      return res.status(403).json({ success: false, error: "Неверная подпись Telegram" });
    }

    let userObj = {
      id: `tg_${id}`,
      internalId: uuidv4(),
      info: {
        first_name: first_name || "",
        last_name: last_name || "",
        username: username || "",
        photo_100: photo_url || "",
      },
      telegram: { id, username, auth_date },
    };

    //  Сохраняем старые данные (город, подписка), если пользователь уже есть
    const existingUser = await usersCollection.findOne({ id: userObj.id });
    if (existingUser) {
      userObj.city = existingUser.city || userObj.city;
      userObj.subscription = existingUser.subscription || userObj.subscription;
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

  const userInDb = await usersCollection.findOne({ id: req.session.user.id });
  if (!userInDb) {
    req.session.destroy(() => {});
    return res.json({ authorized: false });
  }

  const newAccessToken = await refreshAccessToken(req.session.user);
  req.session.user.access_token = newAccessToken;

  const user = req.session.user;
  if (user.subscription && user.subscription.expiresAt) {
    if (Date.now() > user.subscription.expiresAt) {
      user.subscription.active = false;
      await usersCollection.updateOne({ id: user.id }, { $set: { subscription: user.subscription } });
    }
  }

  res.json({ authorized: true, user });
});

// ---- Logout ----
app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ---- Сохранение выбранного города ----
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
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
	
	let newExpiresAt = now + thirtyDaysMs;
    if (user.subscription?.expiresAt && user.subscription.expiresAt > now) {
      newExpiresAt = user.subscription.expiresAt + thirtyDaysMs;
    }

    user.subscription = {
      active: true,
      plan: "basic",
      expiresAt,
    };

    await usersCollection.updateOne(
	  { id: user.id }, 
	  { $set: { subscription: user.subscription } }
	);
    req.session.user = user;

    res.json({ success: true, subscription: user.subscription });
  } catch (e) {
    console.error("Ошибка при покупке подписки/продлении подписки:", e);
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
  
  const newConfirmations = marker.status === "unconfirmed" ? 1 : (marker.confirmations || 0) + 1;
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

// ---------------------- Автообновление статуса меток ----------------------
async function updateMarkersStatus() {
  try {
    const now = Date.now();

    const result = await markersCollection.updateMany(
      { status: "active", timestamp: { $lt: now - 60 * 60 * 1000 } },
      { $set: { status: "unconfirmed", confirmations: 0 } }
    );

    await markersCollection.deleteMany({
      timestamp: { $lt: now - 90 * 60 * 1000 },
    });

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
