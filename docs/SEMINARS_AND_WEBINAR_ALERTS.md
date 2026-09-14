# Seminars & Webinar Alerts — App Implementation Guide

**Audience:** Flutter team
**Base path:** `/api/seminars` and `/api/notifications` (all routes need the normal `Bearer` token)

Supersedes the earlier `SEMINAR_HOME_BANNER.md`.

---

## 1. The shape of the system

There is **one seminar record** per recurring webinar. It owns everything:

- its weekly days and times (each day can have its own time)
- its meeting link and password
- its title, description and banner image

Two things read from it:

1. **The home-screen floating strip** — tells the user the seminar is upcoming / today / about to start / live right now.
2. **Webinar alert pushes** — one admin rule can fire several times per session (e.g. 15 min before, at the start, 10 min in), automatically, for every session.

Both point at the **same destination**: `webinar://<seminarId>`, the seminar page you already have. That route is already wired for push notifications and needs no change.

The admin never types a day or a time into an alert. Move the seminar and every strip and every push follows it.

---

## 2. What you need to build

Only two things. Everything else already works or is decided server-side.

1. **The floating top strip** on the home screen (Section 4).
2. **Show `meetingPasscode`** next to the existing join button on the seminar page (Section 6).

---

## 3. `GET /api/seminars/home`

The home screen already calls this. Same endpoint, new fields.

```json
{
  "success": true,
  "data": {
    "achievements": ["Start your export business", "Find international buyers"],
    "webinar": {
      "status": "live",
      "headline": "Seminar is live now",
      "ctaLabel": "Tap to join",

      "is_live": true,
      "is_today": true,
      "starts_in_minutes": -12,
      "startsAt": "2026-09-20T14:30:00.000Z",
      "endsAt": "2026-09-20T15:30:00.000Z",

      "seminarId": "69f1ff6ec1cafd24cae67a59",
      "title": "Weekly Import/Export Seminar",
      "meetingUrl": "https://zoom.us/j/1234567890?pwd=...",
      "meetingPasscode": "483920",

      "day": "20",
      "month": "September",
      "time": "8:00 pm",
      "whatsapp_message": "Hi, I want to register for the upcoming LIVE webinar."
    }
  }
}
```

| Field | Meaning |
|---|---|
| `status` | `none` · `upcoming` · `today` · `starting_soon` · `live` |
| `headline` | Ready-to-render copy — **render as given** |
| `ctaLabel` | Ready-to-render button text |
| `is_today` | Falls on today's IST date |
| `starts_in_minutes` | Negative once the session is under way |
| `startsAt` / `endsAt` | ISO instants for the current/next session |
| `meetingPasscode` | Empty string when not set |

`day` / `month` / `time` / `is_live` / `whatsapp_message` keep their existing meaning — these are additions, so nothing that reads them today breaks.

> **Note:** `is_live` used to be permanently `false` because of a server bug (a session was rolled to next week the moment it started). That's fixed. If you had written it off as unusable, it works now — though `status` is the field to branch on.

---

## 4. The floating strip

```
status === "none"   → render nothing
otherwise           → show headline + ctaLabel button
tap                 → webinar://<seminarId>   (route already exists)
```

**Render `headline` and `ctaLabel` verbatim.** Don't rebuild the wording client-side from `status` — the server owns it so the copy can change without an app release, exactly like the profile-questions banner.

### What each state looks like

Example seminar: **Sunday 20:00, 60 minutes.**

| When (IST) | `status` | `headline` | `ctaLabel` |
|---|---|---|---|
| Earlier in the week | `upcoming` | "Next seminar on 20 September, 8:00 pm" | View details |
| Sun 00:00 – 19:29 | `today` | "Seminar is today at 8:00 pm" | View details |
| Sun 19:30 – 19:59 | `starting_soon` | "Seminar starts in 25 min" | **Tap to join** |
| Sun 20:00 – 20:59 | `live` | **"Seminar is live now"** | **Tap to join** |
| Sun 21:00 onward | `upcoming` | next session's date | View details |
| No active seminar | `none` | — | — |

`starting_soon` begins a fixed **30 minutes** before the start.

### Two things to get right

**A weekly seminar always has a next occurrence**, so on non-seminar days `status` is `upcoming` — not `none`. `none` means there are no active seminars at all. If the strip should only appear when the seminar is imminent, hide it on `upcoming` client-side; the date still lives on the seminar page.

**The countdown is a snapshot.** "Starts in 25 min" is computed when the request is served. Refetching on home load and app-foreground is enough for correctness. For a ticking countdown, count down locally from `startsAt`.

---

## 5. Webinar alert push notifications

Sent automatically around each session. Nothing new to wire — `type: "webinar"` + `seminarId` already routes to the seminar page.

```json
{
  "notification": { "title": "Seminar starting in 15 minutes", "body": "Join us Sunday at 8:00 pm" },
  "data": {
    "title": "Seminar starting in 15 minutes",
    "body": "Join us Sunday at 8:00 pm",
    "type": "webinar",
    "seminarId": "69f1ff6ec1cafd24cae67a59",
    "linkUrl": "webinar://69f1ff6ec1cafd24cae67a59",
    "meetingUrl": "https://zoom.us/j/1234567890?pwd=...",
    "meetingPasscode": "483920",
    "imageUrl": "https://.../banner.jpg",
    "notificationStyle": "big_picture"
  },
  "android": { "priority": "high", "notification": { "imageUrl": "..." } },
  "apns": { "payload": { "aps": { "mutable-content": 1 } }, "fcmOptions": { "imageUrl": "..." } }
}
```

- **Every `data` value is a string** — FCM requires it.
- `title`/`body` are duplicated into `data` for the killed-app path.
- `seminarId`, `meetingUrl`, `meetingPasscode`, `imageUrl`, `notificationStyle` are **omitted entirely when not set** — check for presence before using them.
- `linkUrl` is always `webinar://<seminarId>`. It never contains a raw Zoom/Meet URL.

### How many to expect

One rule can carry several send times. A rule set to *15 min before · at start · 10 min after* produces, for each session:

```
Sun 19:45   "…starting in 15 minutes…"
Sun 20:00   "…starting now…"
Sun 20:10   "…starting now…"      ← catches anyone who missed the first two
```

Each fires **once** per session. An "after start" send is skipped once the session has ended.

These also land in the in-app inbox: `GET /api/notifications`, with `source: "WEBINAR_AUTO"`.
⚠️ Those records are **deleted after 7 days** (TTL), so the inbox is a rolling window, not history.

---

## 6. The seminar page

Reached from both the strip and the push, via `webinar://<seminarId>`.

`GET /api/seminars/:seminarId` returns the raw seminar:

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "title": "Weekly Import/Export Seminar",
    "description": "...",
    "bannerImageUrl": "...",
    "meetingUrl": "https://zoom.us/j/1234567890?pwd=...",
    "meetingPasscode": "483920",
    "isActive": true,
    "schedule": {
      "type": "weekly",
      "slots": [
        { "dayOfWeek": 0, "time": "20:00", "durationMinutes": 60 },
        { "dayOfWeek": 1, "time": "18:30", "durationMinutes": 90 }
      ],
      "timezone": "Asia/Kolkata",
      "daysOfWeek": [0, 1], "time": "20:00", "durationMinutes": 60
    }
  }
}
```

**What to add here: the passcode row.** Show `meetingPasscode` next to the existing join button, and make it copyable. Hide the row when it's an empty string.

**Open `meetingUrl` externally** — `LaunchMode.externalApplication`, never an in-app webview. Zoom/Meet rely on the OS handing off to their installed app; a webview strands the user on an "open in app" page.

The link usually contains `?pwd=`, so most people join in one tap and never need the passcode — it's the fallback for when that doesn't work.

### Reading the schedule

`slots` is authoritative — **one time per day**, so Sunday 20:00 and Monday 18:30 can coexist.

`daysOfWeek` / `time` / `durationMinutes` still exist but are a **legacy mirror reflecting only the first slot**. They're kept so nothing that reads them crashes. If you display the schedule anywhere, use `slots`. If you only use `/seminars/home`, ignore all of it — the resolution happens server-side.

`dayOfWeek`: **0 = Sunday** … 6 = Saturday. `time` is `"HH:mm"` in `schedule.timezone` (always `Asia/Kolkata`).

---

## 7. Other endpoints on this screen

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/seminars` | Paginated list of active seminars |
| `POST` | `/api/seminars/:seminarId/register` | Register the logged-in user — no body needed, it reads their profile |
| `GET` | `/api/seminars/me/registrations` | That user's registrations |

`register` is idempotent (upsert), so calling it twice is safe.

`achievements` from `/seminars/home` is a plain `string[]` — the "what you'll learn" bullets. `whatsapp_message` is the pre-filled text for the WhatsApp registration tap.

---

## 8. Edge cases

| Situation | What the API does |
|---|---|
| Seminar deactivated | Drops out of `/seminars/home` (`status: "none"` if it was the only one) **and** its alerts stop firing |
| No seminars configured | `status: "none"`, `achievements: []` — render nothing |
| Session in progress | Stays the current occurrence until `start + durationMinutes`; only then rolls to the next |
| Two sessions same day | Each gets its own alerts; the strip shows whichever is next |
| Passcode not set | `meetingPasscode` is `""` — hide the row |
| Meeting link not set | `meetingUrl` is `""` — hide/disable the join button |
