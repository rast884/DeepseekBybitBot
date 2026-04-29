const { Telegraf } = require('telegraf');
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(TOKEN);

// Меню
const menu = {
  reply_markup: {
    keyboard: [
      ['💰 Баланс', '📊 Статистика'],
      ['📍 Позиция', '🎯 Цель'],
      ['▶️ Статус']
    ],
    resize_keyboard: true
  }
};

let balance = 10.0;
let position = null;
let totalTrades = 0;
let winningTrades = 0;

// Получить цену BTC
async function getBTCPrice() {
  const response = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
  return parseFloat(response.data.price);
}

// RSI сигнал
async function getSignal() {
  const response = await axios.get('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=50');
  const closes = response.data.map(c => parseFloat(c[4]));
  
  let gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    let diff = closes[i] - closes[i-1];
    if (diff > 0) {
      gains.push(diff);
      losses.push(0);
    } else {
      gains.push(0);
      losses.push(-diff);
    }
  }
  
  let avgGain = gains.slice(-14).reduce((a,b) => a+b, 0) / 14;
  let avgLoss = losses.slice(-14).reduce((a,b) => a+b, 0) / 14;
  let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  
  if (rsi < 35) return 'buy';
  if (rsi > 65) return 'sell';
  return 'hold';
}

// Команда /start
bot.start(async (ctx) => {
  await ctx.reply(
    `🤖 *FUTURES BOT*\n\nБаланс: $${balance.toFixed(2)}\nПлечо: x100\nЦель: $100,000`,
    { parse_mode: 'Markdown', ...menu }
  );
});

// Кнопка Баланс
bot.hears('💰 Баланс', async (ctx) => {
  await ctx.reply(`💰 *БАЛАНС*\n\nТекущий: $${balance.toFixed(2)}\nP/L: $${(balance - 10).toFixed(2)}`, { parse_mode: 'Markdown' });
});

// Кнопка Статистика
bot.hears('📊 Статистика', async (ctx) => {
  let winRate = totalTrades === 0 ? 0 : (winningTrades / totalTrades * 100);
  await ctx.reply(`📊 *СТАТИСТИКА*\n\nСделок: ${totalTrades}\nWinrate: ${winRate.toFixed(1)}%`, { parse_mode: 'Markdown' });
});

// Кнопка Позиция
bot.hears('📍 Позиция', async (ctx) => {
  if (!position) {
    await ctx.reply('📍 *Нет открытых позиций*', { parse_mode: 'Markdown' });
    return;
  }
  
  const price = await getBTCPrice();
  let pnlPct, pnlUsd;
  
  if (position.side === 'buy') {
    pnlPct = ((price - position.entry) / position.entry) * 100 * 100;
    pnlUsd = (price - position.entry) / position.entry * 1000;
  } else {
    pnlPct = ((position.entry - price) / position.entry) * 100 * 100;
    pnlUsd = (position.entry - price) / position.entry * 1000;
  }
  
  await ctx.reply(
    `📍 *ПОЗИЦИЯ*\n\n${position.side === 'buy' ? '🟢 LONG' : '🔴 SHORT'}\n💰 Вход: $${position.entry.toFixed(2)}\n💵 Текущая: $${price.toFixed(2)}\n📈 P/L: ${pnlPct.toFixed(2)}% ($${pnlUsd.toFixed(2)})\n🎯 TP: $${position.tp.toFixed(2)}\n🛑 SL: $${position.sl.toFixed(2)}`,
    { parse_mode: 'Markdown' }
  );
});

// Кнопка Цель
bot.hears('🎯 Цель', async (ctx) => {
  let percent = (balance / 100000) * 100;
  await ctx.reply(`🎯 *ЦЕЛЬ $100,000*\n\nПрогресс: ${percent.toFixed(2)}%\nОсталось: $${(100000 - balance).toFixed(2)}`, { parse_mode: 'Markdown' });
});

// Кнопка Статус
bot.hears('▶️ Статус', async (ctx) => {
  await ctx.reply(`▶️ *СТАТУС*\n\n🟢 РАБОТАЕТ\nПозиция: ${position ? '✅ Да' : '❌ Нет'}\nПара: BTCUSDT\nПлечо: x100`, { parse_mode: 'Markdown' });
});

// Торговая логика (запускается каждую минуту)
async function trading() {
  const price = await getBTCPrice();
  
  if (position) {
    // Проверяем TP/SL
    if (position.side === 'buy') {
      if (price >= position.tp) {
        let profit = (price - position.entry) / position.entry * 1000;
        balance += profit;
        totalTrades++;
        winningTrades++;
        await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ TP сработал! Прибыль: $${profit.toFixed(2)}\nБаланс: $${balance.toFixed(2)}`);
        position = null;
      } else if (price <= position.sl) {
        let loss = (price - position.entry) / position.entry * 1000;
        balance += loss;
        totalTrades++;
        await bot.telegram.sendMessage(process.env.CHAT_ID, `🛑 SL сработал! Убыток: $${loss.toFixed(2)}\nБаланс: $${balance.toFixed(2)}`);
        position = null;
      }
    } else {
      if (price <= position.tp) {
        let profit = (position.entry - price) / position.entry * 1000;
        balance += profit;
        totalTrades++;
        winningTrades++;
        await bot.telegram.sendMessage(process.env.CHAT_ID, `✅ TP сработал! Прибыль: $${profit.toFixed(2)}\nБаланс: $${balance.toFixed(2)}`);
        position = null;
      } else if (price >= position.sl) {
        let loss = (position.entry - price) / position.entry * 1000;
        balance += loss;
        totalTrades++;
        await bot.telegram.sendMessage(process.env.CHAT_ID, `🛑 SL сработал! Убыток: $${loss.toFixed(2)}\nБаланс: $${balance.toFixed(2)}`);
        position = null;
      }
    }
  } else {
    // Нет позиции — ищем сигнал
    const signal = await getSignal();
    if (signal !== 'hold') {
      let tp, sl;
      if (signal === 'buy') {
        tp = price * (1 + 1/100);
        sl = price * (1 - 0.008);
      } else {
        tp = price * (1 - 1/100);
        sl = price * (1 + 0.008);
      }
      
      position = { side: signal, entry: price, tp: tp, sl: sl };
      await bot.telegram.sendMessage(
        process.env.CHAT_ID,
        `🚀 ОТКРЫТА СДЕЛКА\n${signal === 'buy' ? '🟢 LONG' : '🔴 SHORT'} @ $${price.toFixed(2)}\n🎯 TP: $${tp.toFixed(2)}\n🛑 SL: $${sl.toFixed(2)}`
      );
    }
  }
}

// Запускаем торговлю каждую минуту
setInterval(trading, 60000);

// Запуск бота
bot.launch();
console.log('Бот запущен');
