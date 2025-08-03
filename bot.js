const TelegramBot = require('node-telegram-bot-api');

// Вставь сюда токен своего бота
const token = '8209346809:AAHc6x51KUUNtuC5lSYR2riiwnJjWfBEkYw';

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, 'Привет! Нажми кнопку, чтобы открыть карту.', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Открыть карту', url: 'http://localhost:3000' }],
      ],
    },
  });
});
