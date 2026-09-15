const cron = require('node-cron');
const { Types } = require('mongoose');
const { News, Organization, User } = require('../models');
const { fetchImportExportNews } = require('../services/openaiNews');
const { notifyAllUsersAboutNews } = require('../services/newsNotify');
const logger = require('../utils/logger');

// 10:00 AM and 6:00 PM India Standard Time
const CRON_SCHEDULE = process.env.NEWS_CRON_SCHEDULE || '0 10,18 * * *';
const CRON_TZ = process.env.NEWS_CRON_TZ || 'Asia/Kolkata';
const DEDUPE_HOURS = Number(process.env.NEWS_DEDUPE_HOURS || 48);

let running = false;
let scheduledJob = null;

async function resolveNewsOwnership() {
  let organizationId = process.env.NEWS_ORGANIZATION_ID || '';
  let createdBy = process.env.NEWS_CREATED_BY_USER_ID || '';

  if (organizationId && !Types.ObjectId.isValid(organizationId)) {
    throw new Error('NEWS_ORGANIZATION_ID is not a valid ObjectId');
  }
  if (createdBy && !Types.ObjectId.isValid(createdBy)) {
    throw new Error('NEWS_CREATED_BY_USER_ID is not a valid ObjectId');
  }

  if (!organizationId) {
    const org = await Organization.findOne({ status: 'ACTIVE' }).select('_id').lean();
    if (!org) throw new Error('No ACTIVE organization found for automated news');
    organizationId = String(org._id);
  }

  if (!createdBy) {
    const admin = await User.findOne({
      role: { $in: ['ORG_ADMIN', 'SUPER_ADMIN'] },
      organizationId,
      isActive: true,
    })
      .select('_id')
      .lean();
    if (!admin) {
      const anyAdmin = await User.findOne({
        role: { $in: ['ORG_ADMIN', 'SUPER_ADMIN'] },
        isActive: true,
      })
        .select('_id')
        .lean();
      if (!anyAdmin) throw new Error('No admin user found for automated news createdBy');
      createdBy = String(anyAdmin._id);
    } else {
      createdBy = String(admin._id);
    }
  }

  return { organizationId, createdBy };
}

async function isDuplicateNews({ title, linkUrl }) {
  const since = new Date(Date.now() - DEDUPE_HOURS * 60 * 60 * 1000);
  const or = [];
  if (linkUrl) or.push({ linkUrl });
  if (title) or.push({ title });
  if (!or.length) return false;

  const existing = await News.findOne({
    createdAt: { $gte: since },
    $or: or,
  })
    .select('_id')
    .lean();

  return Boolean(existing);
}

/**
 * One full automated cycle: OpenAI fetch → save News → notify all users.
 */
async function runNewsDigestOnce() {
  const ownership = await resolveNewsOwnership();
  const article = await fetchImportExportNews();

  if (await isDuplicateNews({ title: article.title, linkUrl: article.linkUrl })) {
    logger.info('[newsCron] Skipping duplicate news:', article.title);
    return { skipped: true, reason: 'DUPLICATE', title: article.title };
  }

  const news = await News.create({
    organizationId: ownership.organizationId,
    title: article.title,
    description: article.description,
    content: article.content,
    imageUrl: article.imageUrl || '',
    linkUrl: article.linkUrl || '',
    tags: article.tags || [],
    isPublished: true,
    createdBy: ownership.createdBy,
  });

  const notify = await notifyAllUsersAboutNews(news);

  logger.info(
    `[newsCron] Published news ${news._id} and notified ${notify.sentCount} user(s); push success=${notify.push?.successCount || 0}`
  );

  return {
    skipped: false,
    newsId: String(news._id),
    title: news.title,
    notify,
  };
}

function startNewsCron() {
  if (scheduledJob) return scheduledJob;

  const enabled = String(process.env.NEWS_CRON_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    logger.info('[newsCron] Disabled via NEWS_CRON_ENABLED=false');
    return null;
  }

  if (!cron.validate(CRON_SCHEDULE)) {
    logger.error('[newsCron] Invalid NEWS_CRON_SCHEDULE:', CRON_SCHEDULE);
    return null;
  }

  scheduledJob = cron.schedule(
    CRON_SCHEDULE,
    async () => {
      if (running) {
        logger.info('[newsCron] Previous run still in progress, skipping');
        return;
      }
      running = true;
      try {
        await runNewsDigestOnce();
      } catch (err) {
        logger.error('[newsCron] error:', err.message || err);
        if (err.details) logger.error('[newsCron] details:', err.details);
      } finally {
        running = false;
      }
    },
    { timezone: CRON_TZ }
  );

  logger.info(`[newsCron] Scheduled "${CRON_SCHEDULE}" (${CRON_TZ})`);
  return scheduledJob;
}

module.exports = {
  startNewsCron,
  runNewsDigestOnce,
};
