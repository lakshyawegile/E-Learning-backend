# Push Notification — Internal Navigation Reference

**Audience:** Backend / Admin panel team
**Client status:** Implemented and live — no client release is required to start using this.

---

## 1. Overview

A push notification's `data` payload can tell the app to open a specific
screen when the user taps it. This works in all 3 states a notification can
be received/tapped in — app in foreground, app in background, and app fully
killed (opened cold via the notification) — no extra work needed per state,
the client already handles all three uniformly.

## 2. Payload shape

```json
{ "title": "string", "body": "string", "type": "..." }
```

`type` selects the destination. Some types need one extra field alongside
it (noted below). Everything else in the payload (`title`, `body`) is used
for the notification itself, same as today.

## 3. Types that need an extra field (open a *specific* item)

| `type` | Extra field | Opens |
|---|---|---|
| `news` | `newsId` | That specific news article |
| `webinar` | `seminarId` | That specific webinar's detail page |

Example:

```json
{ "title": "New Update", "body": "...", "type": "news", "newsId": "abc123" }
```

## 4. Types that need nothing else (open a general page)

| `type` | Opens |
|---|---|
| `premium` | Premium Features page |
| `one-on-one` | One-on-One Classes page |
| `courses` | Courses list |
| `news-list` | News list (the list, not one article — use `news` + `newsId` for a specific article) |
| `shorts` | Shorts feed |
| `community` | Community chat |
| `quiz` | Quiz topics |
| `tools` | All Tools page |
| `gallery` | Gallery |
| `profile` | Profile |
| `import-journey` | Import Journey |
| `export-journey` | Export Journey |
| `consultation` | Free counseling / consultation booking |
| `tool-export-price` | Export Price Calculator |
| `tool-import-calc` | Import Calculator |
| `tool-cbm` | CBM Calculator |
| `tool-gst` | GST Calculator |
| `tool-hsn-finder` | HSN Finder |
| `tool-forex` | Forex Converter |
| `tool-forex-rates` | Forex Rates List |
| `tool-gov-benefits` | Government Benefits |
| `tool-incoterms` | Incoterms Guide |
| `tool-product-cert` | Product Certification |

Example:

```json
{ "title": "Go Premium", "body": "Unlock everything today", "type": "premium" }
```

## 5. Format requirements

- `type` matching is **exact** — case-sensitive, no extra whitespace.
- An unrecognized `type` is simply ignored (no navigation, no crash) — the
  notification still displays normally, it just won't deep-link anywhere.
- If both `type` and `newsId`/`seminarId` are required for a type (Section
  3) and the ID is missing or empty, the same thing happens — notification
  shows, no navigation.

## 6. Not yet supported

Deep-linking to a specific **course** (`type: "course"` + `courseId`) isn't
wired up yet, even though the equivalent exists for news and webinars.
Let us know if this is needed and we'll add it.

## 7. In-app notification list

The same `type` values also work for notifications shown in the in-app
notification inbox (`GET /api/notifications`), via the same `data` payload
on each item. If an item instead only carries `linkUrl` (no `data.type`),
these schemes are recognized as a fallback: `news://<id>`,
`premium://...`, `one-on-one://...`, `webinar://<id>` — but `type` is the
preferred/primary way and works for the full list in Sections 3–4; `linkUrl`
fallback only exists for `news`/`premium`/`one-on-one`/`webinar`.

## 8. Reference — implementation location

- Router: `lib/core/services/notification_router.dart`
- Consumed by: `lib/core/services/firebase_messaging_service.dart` (all 3
  app states) and `lib/features/notifications/presentation/screens/notifications_screen.dart`
  (in-app list)
- Shares its page set with the dashboard banner system
  (`BANNER_INTERNAL_LINKS.md`) — same destination screens, different
  trigger field (`type` here vs. `linkUrl` for banners).
