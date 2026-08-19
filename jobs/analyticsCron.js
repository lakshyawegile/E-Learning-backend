const cron = require('node-cron');
const mongoose = require('mongoose');

const { AnalyticsLogEvent, DailyAnalytics, AnalyticsMeta } = require('../models');

const META_KEY = process.env.ANALYTICS_LAST_PROCESSED_KEY || 'lastProcessedAt';
const CRON_SCHEDULE = process.env.ANALYTICS_CRON_SCHEDULE || '*/10 * * * *'; // every 10 minutes

let running = false;
let scheduledJob = null;
let indexesEnsured = false;

async function ensureDailyAnalyticsIndexes() {
  if (indexesEnsured) return;
  // Ensure DB indexes match the current schema.
  // This will drop obsolete indexes (like the old unique index on organizationId+event_name+date)
  // and create the new unique index including param_key/param_value.
  await DailyAnalytics.syncIndexes();
  indexesEnsured = true;
}

async function getLastProcessedAt() {
  const existing = await AnalyticsMeta.findOne({ key: META_KEY }).lean();
  if (existing?.value) return existing.value;

  // On first run, backfill a small window to avoid full collection scans.
  const backfillHours = Number(process.env.ANALYTICS_INITIAL_BACKFILL_HOURS || 6);
  const initial = new Date(Date.now() - backfillHours * 60 * 60 * 1000);

  await AnalyticsMeta.updateOne(
    { key: META_KEY },
    { $set: { value: initial } },
    { upsert: true }
  );
  return initial;
}

async function setLastProcessedAt(date) {
  await AnalyticsMeta.updateOne(
    { key: META_KEY },
    { $set: { value: date } },
    { upsert: true }
  );
}

function buildKey({ date, organizationId, event_name }) {
  return `${date}|${String(organizationId)}|${event_name}`;
}

// Map event_name -> which parameters key to use for aggregation dimension
// (lets you answer "which screen?" etc. without storing full parameters)
const DIMENSION_KEY_BY_EVENT = {
  screen_view: 'screen_name',
  button_tap: 'button_name',
  shorts_view: 'short_id',
  view_course_details: 'course_id',
  video_start: 'video_id',
  quiz_start: 'quiz_id',
};

async function aggregateAndUpsert({ windowStart, windowEnd }) {
  // 1) Aggregate raw events inserted inside the window to get totals and the set of impacted keys.
  // NOTE: this matches on createdAt (server insertion time), not event_timestamp. Client-reported
  // event_timestamp can arrive far in the past (offline-queued events synced later) - matching on
  // it here would let the watermark advance past those events before they're ever inserted,
  // silently dropping them forever. event_timestamp is still used below to bucket into the correct
  // calendar day; only "have I already scanned this document" is keyed off createdAt.
  const windowGroups = await AnalyticsLogEvent.aggregate([
    {
      $match: {
        createdAt: { $gt: windowStart, $lte: windowEnd },
      },
    },
    {
      $project: {
        date: { $dateToString: { format: '%Y-%m-%d', date: '$event_timestamp', timezone: 'UTC' } },
        organizationId: 1,
        event_name: 1,
        userId: 1,
        parameters: 1,
      },
    },
    {
      $addFields: {
        param_key: {
          $ifNull: [
            {
              $getField: {
                field: '$event_name',
                input: DIMENSION_KEY_BY_EVENT,
              },
            },
            '',
          ],
        },
      },
    },
    {
      $addFields: {
        param_value: {
          $cond: [
            { $and: [{ $ne: ['$param_key', ''] }, { $ne: ['$parameters', null] }] },
            {
              $toString: {
                $ifNull: [
                  {
                    $getField: {
                      field: '$param_key',
                      input: '$parameters',
                    },
                  },
                  '',
                ],
              },
            },
            '',
          ],
        },
      },
    },
    {
      $group: {
        _id: {
          date: '$date',
          organizationId: '$organizationId',
          event_name: '$event_name',
          param_key: '$param_key',
          param_value: '$param_value',
        },
        total_count: { $sum: 1 },
        unique_users_set: { $addToSet: '$userId' },
      },
    },
    {
      $project: {
        _id: 0,
        date: '$_id.date',
        organizationId: '$_id.organizationId',
        event_name: '$_id.event_name',
        param_key: '$_id.param_key',
        param_value: '$_id.param_value',
        total_count: 1,
        // Note: we compute unique_users_count again cumulatively below for accuracy.
        unique_users_count: {
          $size: {
            $filter: {
              input: '$unique_users_set',
              as: 'u',
              cond: { $ne: ['$$u', null] },
            },
          },
        },
      },
    },
  ]);

  if (!windowGroups.length) return 0;

  const impacted = windowGroups.map((g) => ({
    date: g.date,
    organizationId: g.organizationId,
    event_name: g.event_name,
    param_key: g.param_key,
    param_value: g.param_value,
  }));

  const orgIds = [
    ...new Set(impacted.map((k) => String(k.organizationId))),
  ]
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));
  const eventNames = [...new Set(impacted.map((k) => k.event_name))];
  const dates = [...new Set(impacted.map((k) => k.date))];

  // earliest date among impacted keys
  const minDateStr = dates.sort()[0];
  const minDayStart = new Date(`${minDateStr}T00:00:00.000Z`);

  // 2) Compute cumulative unique user counts for the affected day(s) up to windowEnd.
  const cumulativeGroups = await AnalyticsLogEvent.aggregate([
    {
      $match: {
        event_timestamp: { $gte: minDayStart, $lte: windowEnd },
        organizationId: { $in: orgIds },
        event_name: { $in: eventNames },
      },
    },
    {
      $project: {
        date: { $dateToString: { format: '%Y-%m-%d', date: '$event_timestamp', timezone: 'UTC' } },
        organizationId: 1,
        event_name: 1,
        userId: 1,
        parameters: 1,
      },
    },
    {
      $addFields: {
        param_key: {
          $ifNull: [
            {
              $getField: {
                field: '$event_name',
                input: DIMENSION_KEY_BY_EVENT,
              },
            },
            '',
          ],
        },
      },
    },
    {
      $addFields: {
        param_value: {
          $cond: [
            { $and: [{ $ne: ['$param_key', ''] }, { $ne: ['$parameters', null] }] },
            {
              $toString: {
                $ifNull: [
                  {
                    $getField: {
                      field: '$param_key',
                      input: '$parameters',
                    },
                  },
                  '',
                ],
              },
            },
            '',
          ],
        },
      },
    },
    {
      $group: {
        _id: {
          date: '$date',
          organizationId: '$organizationId',
          event_name: '$event_name',
          param_key: '$param_key',
          param_value: '$param_value',
        },
        unique_users_set: { $addToSet: '$userId' },
      },
    },
    {
      $project: {
        _id: 0,
        date: '$_id.date',
        organizationId: '$_id.organizationId',
        event_name: '$_id.event_name',
        param_key: '$_id.param_key',
        param_value: '$_id.param_value',
        unique_users_count: {
          $size: {
            $filter: {
              input: '$unique_users_set',
              as: 'u',
              cond: { $ne: ['$$u', null] },
            },
          },
        },
      },
    },
  ]);

  const uniqueMap = new Map(
    cumulativeGroups.map((g) => [`${g.date}|${String(g.organizationId)}|${g.event_name}|${g.param_key}|${g.param_value}`, g.unique_users_count])
  );

  // 3) Upsert DailyAnalytics:
  // - increment total_count by the window total_count
  // - set unique_users_count to the cumulative unique for that day up to windowEnd
  const bulkOps = windowGroups.map((g) => ({
    updateOne: {
      filter: {
        date: g.date,
        organizationId: g.organizationId,
        event_name: g.event_name,
        param_key: g.param_key || '',
        param_value: g.param_value || '',
      },
      update: {
        $inc: { total_count: g.total_count },
        $set: {
          unique_users_count:
            uniqueMap.get(`${g.date}|${String(g.organizationId)}|${g.event_name}|${g.param_key}|${g.param_value}`) ?? 0,
        },
      },
      upsert: true,
    },
  }));

  const result = await DailyAnalytics.bulkWrite(bulkOps, { ordered: false });
  return result?.getUpsertedCount ? (result.getUpsertedCount() + result.getModifiedCount()) : bulkOps.length;
}

async function runOnce() {
  await ensureDailyAnalyticsIndexes();
  const windowStart = await getLastProcessedAt();
  const windowEnd = new Date();

  if (windowEnd <= windowStart) return 0;

  const processed = await aggregateAndUpsert({ windowStart, windowEnd });
  await setLastProcessedAt(windowEnd);

  return processed;
}

function startAnalyticsCron() {
  if (scheduledJob) return scheduledJob;

  scheduledJob = cron.schedule(CRON_SCHEDULE, async () => {
    if (running) return;
    running = true;
    try {
      await runOnce();
    } catch (err) {
      console.error('analyticsCron error:', err);
    } finally {
      running = false;
    }
  });

  return scheduledJob;
}

module.exports = { startAnalyticsCron, runOnce, aggregateAndUpsert, DIMENSION_KEY_BY_EVENT };

