const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = process.env.OPENAI_NEWS_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

const NEWS_PROMPT = `You are a trade-news researcher for an Import/Export learning app used by Indian businessmen.

Use web search to find ONE real, recent news story that is useful for import/export traders. Prefer topics like:
- wars / geopolitics affecting trade routes or commodities
- tariffs, duties, customs, trade policy (India or major partners)
- shipping, freight, ports, logistics disruptions
- currency / commodity moves that affect importers/exporters
- FTAs, sanctions, export bans, import restrictions

Rules:
- Prefer news from the last 24–48 hours. If nothing fresh, use the most recent relevant story.
- Base the article on real sources you found via web search. Do not invent facts.
- Write in simple, clear English that a busy trader can understand.
- "title" must be catchy and VERY short — 5 to 6 words MAXIMUM, no more. It is a push notification headline, not a sentence; longer titles get cut off/collapsed on phones. Cut ruthlessly — punchy over descriptive.
- "description" must be 1–2 short sentences (max ~160 chars) — the notification body / teaser.
- "content" must be a full readable article (4–8 short paragraphs) summarizing what happened, why it matters for import/export, and any practical takeaway.
- "linkUrl" must be the best primary source URL you found.
- "tags" should be 2–5 short lowercase tags (e.g. "tariff", "shipping", "war", "customs").
- "imageUrl" only if you have a direct public image URL from a source; otherwise empty string.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "title": "string",
  "description": "string",
  "content": "string",
  "linkUrl": "string",
  "tags": ["string"],
  "imageUrl": "string"
}`;

function extractOutputText(data) {
  if (data?.output_text && typeof data.output_text === 'string') {
    return data.output_text.trim();
  }

  const outputs = Array.isArray(data?.output) ? data.output : [];
  const texts = [];
  for (const item of outputs) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        texts.push(part.text);
      }
    }
  }
  return texts.join('\n').trim();
}

function parseNewsJson(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    const err = new Error('Empty news response from OpenAI');
    err.code = 'OPENAI_EMPTY_RESPONSE';
    throw err;
  }

  let jsonText = trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    const err = new Error('OpenAI news response was not valid JSON');
    err.code = 'OPENAI_INVALID_JSON';
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText.slice(start, end + 1));
  } catch (e) {
    const err = new Error('Failed to parse OpenAI news JSON');
    err.code = 'OPENAI_INVALID_JSON';
    err.cause = e;
    throw err;
  }

  let title = String(parsed.title || '').trim();
  const titleWords = title.split(/\s+/).filter(Boolean);
  if (titleWords.length > 8) {
    title = titleWords.slice(0, 8).join(' ');
  }
  const description = String(parsed.description || '').trim();
  const content = String(parsed.content || '').trim();
  if (!title || !description || !content) {
    const err = new Error('OpenAI news JSON missing title, description, or content');
    err.code = 'OPENAI_INCOMPLETE_NEWS';
    throw err;
  }

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 8)
    : [];

  const cleanContent = content
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\s+\n/g, '\n')
    .trim();

  return {
    title: title.slice(0, 120),
    description: description.slice(0, 300),
    content: cleanContent,
    linkUrl: String(parsed.linkUrl || '').trim().split('?utm_source=openai')[0],
    imageUrl: String(parsed.imageUrl || '').trim(),
    tags,
  };
}

function extractMetaImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Best-effort scrape of the article page's og:image/twitter:image meta tag,
 * used as a fallback when OpenAI doesn't return a direct image URL.
 */
async function fetchOgImage(pageUrl) {
  if (!pageUrl) return '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(pageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsImageBot/1.0)' },
    });
    if (!response.ok) return '';

    const html = await response.text();
    const raw = extractMetaImage(html);
    if (!raw) return '';

    return new URL(raw, pageUrl).href;
  } catch (err) {
    console.warn('[openaiNews] og:image scrape failed:', err.message || err);
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches one import/export related news item via OpenAI web search
 * and returns structured fields for the News model + notification teaser.
 */
async function fetchImportExportNews() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.code = 'OPENAI_NOT_CONFIGURED';
    throw err;
  }

  const today = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      tools: [
        {
          type: 'web_search',
          search_context_size: process.env.OPENAI_NEWS_SEARCH_CONTEXT || 'medium',
        },
      ],
      tool_choice: { type: 'web_search' },
      input: `${NEWS_PROMPT}\n\nToday's date (IST): ${today}. Find the best story for today's digest.`,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data?.error?.message || 'OpenAI news request failed');
    err.code = 'OPENAI_API_ERROR';
    err.status = response.status;
    err.details = data?.error || null;
    throw err;
  }

  const news = parseNewsJson(extractOutputText(data));

  if (!news.imageUrl && news.linkUrl) {
    news.imageUrl = await fetchOgImage(news.linkUrl);
  }

  return news;
}

module.exports = {
  fetchImportExportNews,
  parseNewsJson,
  fetchOgImage,
};
