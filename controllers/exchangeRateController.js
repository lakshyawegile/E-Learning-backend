const https = require('https');

const { ExchangeRateCache } = require('../models');
const logger = require('../utils/logger');

const EXCHANGE_RATE_API_KEY =
  process.env.EXCHANGE_RATE_API_KEY || '0e68e791dfe80a5637280ec3';

const fetchJson = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw || '{}');
            resolve({ statusCode: res.statusCode || 0, data: parsed });
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });

const pad2 = (n) => String(n).padStart(2, '0');
const formatUTCDate = (d) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

// GET /api/dashboard/exchange-rates?base=INR
const getExchangeRates = async (req, res) => {
  try {
    const base = String(req.query.base || 'INR').trim().toUpperCase();
    const nowUnix = Math.floor(Date.now() / 1000);
    const now = new Date();
    const todayUTC = formatUTCDate(now);
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayUTC = formatUTCDate(yesterday);
    logger.info('yesterdayUTC', yesterdayUTC);

    const cached = await ExchangeRateCache.findOne({ base_code: base, date: todayUTC })
      .lean();
    const prev = await ExchangeRateCache.findOne({ base_code: base, date: yesterdayUTC }).lean();

    const canUseCache =
      cached &&
      typeof cached.time_next_update_unix === 'number' &&
      cached.time_next_update_unix > 0 &&
      nowUnix < cached.time_next_update_unix;

    const cachedDataToReturn = cached
      ? {
          result: cached.result,
          base_code: cached.base_code,
          date: cached.date,
          time_last_update_unix: cached.time_last_update_unix,
          time_last_update_utc: cached.time_last_update_utc,
          time_next_update_unix: cached.time_next_update_unix,
          time_next_update_utc: cached.time_next_update_utc,
          conversion_rates: cached.conversion_rates,
        }
      : null;

    if (canUseCache) {
      const delta = {};
      const todayRates = cachedDataToReturn?.conversion_rates || {};
      const prevRates = prev?.conversion_rates || {};
      for (const [code, todayRate] of Object.entries(todayRates)) {
        const prevRate = prevRates?.[code];
        if (typeof todayRate === 'number' && typeof prevRate === 'number') {
          const diff = todayRate - prevRate;
          delta[code] = {
            today: todayRate,
            yesterday: prevRate,
            diff,
            diff_percent: prevRate !== 0 ? (diff / prevRate) * 100 : null,
          };
        }
      }

      const previousDataToReturn = prev
        ? {
            result: prev.result,
            base_code: prev.base_code,
            date: prev.date,
            time_last_update_unix: prev.time_last_update_unix,
            time_last_update_utc: prev.time_last_update_utc,
            time_next_update_unix: prev.time_next_update_unix,
            time_next_update_utc: prev.time_next_update_utc,
            conversion_rates: prev.conversion_rates,
          }
        : null;

      return res.json({
        source: 'cache',
        data: cachedDataToReturn,
        previous: previousDataToReturn,
        delta,
      });
    }

    const url = `https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}/latest/${encodeURIComponent(base)}`;
    const { statusCode, data } = await fetchJson(url);

    if (statusCode < 200 || statusCode >= 300 || !data || data.result !== 'success') {
      if (cachedDataToReturn) return res.json({ source: 'cache', data: cachedDataToReturn });
      return res.status(502).json({ message: 'Failed to fetch exchange rates' });
    }

    const toStore = {
      base_code: data.base_code || base,
      date: todayUTC,
      result: data.result || '',
      documentation: data.documentation || '',
      terms_of_use: data.terms_of_use || '',
      time_last_update_unix: Number(data.time_last_update_unix || 0),
      time_last_update_utc: String(data.time_last_update_utc || ''),
      time_next_update_unix: Number(data.time_next_update_unix || 0),
      time_next_update_utc: String(data.time_next_update_utc || ''),
      conversion_rates: data.conversion_rates || {},
      fetchedAt: new Date(),
    };

    const saved = await ExchangeRateCache.findOneAndUpdate(
      { base_code: toStore.base_code, date: toStore.date },
      { $set: toStore },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    const dataToReturn = {
      result: saved.result,
      base_code: saved.base_code,
      date: saved.date,
      time_last_update_unix: saved.time_last_update_unix,
      time_last_update_utc: saved.time_last_update_utc,
      time_next_update_unix: saved.time_next_update_unix,
      time_next_update_utc: saved.time_next_update_utc,
      conversion_rates: saved.conversion_rates,
    };

    const previousDataToReturn = prev
      ? {
          result: prev.result,
          base_code: prev.base_code,
          date: prev.date,
          time_last_update_unix: prev.time_last_update_unix,
          time_last_update_utc: prev.time_last_update_utc,
          time_next_update_unix: prev.time_next_update_unix,
          time_next_update_utc: prev.time_next_update_utc,
          conversion_rates: prev.conversion_rates,
        }
      : null;

    const delta = {};
    const todayRates = dataToReturn?.conversion_rates || {};
    const prevRates = prev?.conversion_rates || {};
    for (const [code, todayRate] of Object.entries(todayRates)) {
      const prevRate = prevRates?.[code];
      if (typeof todayRate === 'number' && typeof prevRate === 'number') {
        const diff = todayRate - prevRate;
        delta[code] = {
          today: todayRate,
          yesterday: prevRate,
          diff,
          diff_percent: prevRate !== 0 ? (diff / prevRate) * 100 : null,
        };
      }
    }

    return res.json({
      source: 'live',
      data: dataToReturn,
      previous: previousDataToReturn,
      delta,
    });
  } catch (err) {
    logger.error('getExchangeRates error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { getExchangeRates };

