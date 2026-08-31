const { News } = require('../models');
const paginate = require('../utils/pagination');
const { deleteMediaIfOwned } = require('../utils/mediaCleanup');

// POST /api/news
const createNews = async (req, res) => {
  try {
    const { organizationId, title, description, content, imageUrl, linkUrl, tags, isPublished, createdBy } = req.body;

    if (!organizationId || !title || !createdBy) {
      return res.status(400).json({ message: 'organizationId, title, and createdBy are required' });
    }

    const news = await News.create({
      organizationId,
      title,
      description,
      content,
      imageUrl,
      linkUrl,
      tags,
      isPublished: isPublished !== undefined ? isPublished : false,
      createdBy,
    });

    return res.status(201).json(news);
  } catch (err) {
    console.error('createNews error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/news
const listNews = async (req, res) => {
  try {
    const { page, limit, organizationId, includeUnpublished } = req.query;
    const filter = {};
    if (organizationId) filter.organizationId = organizationId;
    if (!includeUnpublished || includeUnpublished === 'false') {
      filter.isPublished = true;
    }
    const result = await paginate(News, {
      filter,
      page,
      limit,
      sort: { createdAt: -1 },
    });
    return res.json(result);
  } catch (err) {
    console.error('listNews error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// GET /api/news/:newsId
const getNewsById = async (req, res) => {
  try {
    const { newsId } = req.params;
    const news = await News.findById(newsId).lean();
    if (!news) {
      return res.status(404).json({ success: false, message: 'News not found' });
    }
    if (!news.isPublished && req.query.includeUnpublished !== 'true') {
      return res.status(404).json({ success: false, message: 'News not found' });
    }
    return res.json({
      success: true,
      data: {
        _id: news._id,
        title: news.title,
        description: news.description,
        content: news.content,
        imageUrl: news.imageUrl,
        linkUrl: news.linkUrl,
        tags: news.tags,
        createdAt: news.createdAt,
      },
    });
  } catch (err) {
    console.error('getNewsById error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/news/:newsId
const updateNews = async (req, res) => {
  try {
    const { newsId } = req.params;
    const { title, description, content, imageUrl, linkUrl, tags, isPublished } = req.body;

    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description;
    if (content !== undefined) updates.content = content;
    if (imageUrl !== undefined) updates.imageUrl = imageUrl;
    if (linkUrl !== undefined) updates.linkUrl = linkUrl;
    if (tags !== undefined) updates.tags = tags;
    if (isPublished !== undefined) updates.isPublished = isPublished;

    const previous = imageUrl !== undefined
      ? await News.findById(newsId).select('imageUrl').lean()
      : null;

    const news = await News.findByIdAndUpdate(newsId, { $set: updates }, { new: true, runValidators: true });
    if (!news) {
      return res.status(404).json({ message: 'News not found' });
    }

    if (previous && previous.imageUrl && previous.imageUrl !== imageUrl) {
      deleteMediaIfOwned(previous.imageUrl);
    }

    return res.json(news);
  } catch (err) {
    console.error('updateNews error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// DELETE /api/news/:newsId
const deleteNews = async (req, res) => {
  try {
    const { newsId } = req.params;
    const deleted = await News.findByIdAndDelete(newsId);
    if (!deleted) {
      return res.status(404).json({ message: 'News not found' });
    }

    if (deleted.imageUrl) {
      deleteMediaIfOwned(deleted.imageUrl);
    }

    return res.json({ message: 'News deleted' });
  } catch (err) {
    console.error('deleteNews error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createNews,
  listNews,
  getNewsById,
  updateNews,
  deleteNews,
};
