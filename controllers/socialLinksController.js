const { SocialLinksConfig, Organization } = require('../models');

const emptyResponse = () => ({
  whatsapp_number: '',
  youtube_url: '',
  instagram_url: '',
  facebook_url: '',
  twitter_url: '',
  linkedin_url: '',
  telegram_url: '',
  website_url: '',
  support_email: '',
});

const resolveDefaultOrganizationId = async () => {
  const envOrgId = process.env.SOCIAL_LINKS_ORGANIZATION_ID || '';
  if (envOrgId) return envOrgId;
  const org = await Organization.findOne({ status: 'ACTIVE' }).select('_id').lean();
  return org ? String(org._id) : '';
};

const getSocialLinks = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId || (await resolveDefaultOrganizationId());
    if (!organizationId) {
      return res.json({ success: true, data: emptyResponse() });
    }

    const doc = await SocialLinksConfig.findOne({ organizationId, isActive: true }).lean();
    return res.json({
      success: true,
      data: doc
        ? {
            ...emptyResponse(),
            whatsapp_number: doc.whatsapp_number,
            youtube_url: doc.youtube_url,
            instagram_url: doc.instagram_url,
            facebook_url: doc.facebook_url,
            twitter_url: doc.twitter_url,
            linkedin_url: doc.linkedin_url,
            telegram_url: doc.telegram_url,
            website_url: doc.website_url,
            support_email: doc.support_email,
          }
        : emptyResponse(),
    });
  } catch (err) {
    console.error('getSocialLinks error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const updateSocialLinks = async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const createdBy = req.user?.userId || null;
    if (!organizationId) return res.status(400).json({ message: 'User organization not found' });

    const {
      whatsapp_number,
      youtube_url,
      instagram_url,
      facebook_url,
      twitter_url,
      linkedin_url,
      telegram_url,
      website_url,
      support_email,
      isActive,
    } = req.body || {};

    const updates = {};
    const toSetString = (key, v) => {
      if (v !== undefined) updates[key] = String(v).trim();
    };

    toSetString('whatsapp_number', whatsapp_number);
    toSetString('youtube_url', youtube_url);
    toSetString('instagram_url', instagram_url);
    toSetString('facebook_url', facebook_url);
    toSetString('twitter_url', twitter_url);
    toSetString('linkedin_url', linkedin_url);
    toSetString('telegram_url', telegram_url);
    toSetString('website_url', website_url);
    toSetString('support_email', support_email);
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (!updates.createdBy && createdBy) updates.createdBy = createdBy;

    const saved = await SocialLinksConfig.findOneAndUpdate(
      { organizationId },
      { $set: { organizationId, ...updates } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        whatsapp_number: saved.whatsapp_number,
        youtube_url: saved.youtube_url,
        instagram_url: saved.instagram_url,
        facebook_url: saved.facebook_url,
        twitter_url: saved.twitter_url,
        linkedin_url: saved.linkedin_url,
        telegram_url: saved.telegram_url,
        website_url: saved.website_url,
        support_email: saved.support_email,
      },
    });
  } catch (err) {
    console.error('updateSocialLinks error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = { getSocialLinks, updateSocialLinks };

