import Imap from "imap";
import { simpleParser } from "mailparser";
import dotenv from "dotenv";
dotenv.config();

const imap = new Imap({
  user: process.env.MAILRU_USER,
  password: process.env.MAILRU_PASSWORD,
  host: "imap.mail.ru",
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
});

imap.once("ready", function () {
  console.log("[TestMail] Подключаемся к INBOX...");
  imap.openBox("INBOX", true, function (err, box) {
    if (err) throw err;
    const fetcher = imap.seq.fetch(`${box.messages.total}:*`, {
      bodies: "",
      struct: true,
    });

    fetcher.on("message", function (msg) {
      msg.on("body", function (stream) {
        simpleParser(stream, (err, mail) => {
          if (err) console.error("[TestMail] Ошибка парсинга:", err);
          else {
            console.log("\n===============================");
            console.log("От:", mail.from?.text);
            console.log("Тема:", mail.subject);
            console.log("-------------------------------");
            console.log(mail.text || mail.html?.slice(0, 1500) || "(пустое)");
          }
        });
      });
    });

    fetcher.once("end", function () {
      console.log("[TestMail] Готово, закрываем соединение...");
      imap.end();
    });
  });
});

imap.once("error", function (err) {
  console.error("[TestMail] Ошибка:", err);
});

imap.once("end", function () {
  console.log("[TestMail] Подключение закрыто");
});

imap.connect();
