# Profile Questions — Home Banner + Lead Capture

**Audience:** Flutter team, admin-panel team
**Base path:** `/api/profile-questions` (all routes require the normal `Bearer` token)

---

## 1. Why this exists

After OTP signup the backend knows only a user's mobile number. This feature asks a
short, admin-defined set of business questions from a home-screen banner and surfaces
the answers to the calling team in the admin user list and CSV export.

It also repairs two things that were silently degraded:

- `User.interestedIn` has had no writer since roughly April 2026, so the push-notification
  audience filter in `services/notificationBroadcast.js` matched almost nobody. The interest
  question writes it again.
- `User.name` is empty for phone-only signups, so `Hi, {Name}` on the dashboard rendered
  blank. The full-name question fills it.

## 2. Flow

1. App opens → `GET /api/profile-questions`.
2. Response carries **one** banner, already resolved for this user's state.
   - Not finished → "before completion" banner, action `open_questionnaire`.
   - Finished → "after completion" banner, whatever action the admin chose.
3. Tapping the first banner opens a popup that asks `questions[]` **one at a time**,
   starting at `nextQuestionKey`.
4. Each answer → `POST /api/profile-questions/answers`. Saving per question means a user
   who quits at question 4 still leaves answers 1–3 behind.
5. When the last required question lands, the response flips to the second banner.
   The app re-renders from that response — no reload needed.

## 3. App endpoints

### `GET /api/profile-questions`

The only call needed to render the banner and the popup.

```json
{
  "success": true,
  "data": {
    "isComplete": false,
    "completionPercentage": 50,
    "configVersion": 3,
    "banner": {
      "state": "incomplete",
      "title": "Complete your profile",
      "subtitle": "Tell us about your business so our team can guide you",
      "imageUrl": "https://.../banner.png",
      "ctaLabel": "Complete now",
      "action": "open_questionnaire",
      "actionValue": "",
      "isVisible": true
    },
    "questions": [
      {
        "key": "targetMarket",
        "label": "Which market do you want to trade with?",
        "helperText": "",
        "inputType": "both",
        "options": ["UAE", "USA", "Europe"],
        "required": true,
        "order": 3,
        "maxLength": 200
      }
    ],
    "answers": { "fullName": { "optionValue": "", "textValue": "Ravi", "value": "Ravi" } },
    "answeredKeys": ["fullName"],
    "nextQuestionKey": "targetMarket",
    "totalRequired": 6,
    "answeredRequired": 3
  }
}
```

Notes for the client:

- **Render `banner` as given.** Do not branch on `isComplete` to pick copy — the server
  already picked. `isVisible: false` means draw nothing.
- `imageUrl` is optional — blank means render the banner text-only (no right-side image).
  Intended layout: title/subtitle/button stacked on the left, `imageUrl` filling a fixed-size
  box on the right (this mirrors the admin panel's own live preview, so what the admin sees
  while editing is what should ship). No fixed pixel size is enforced server-side — pick
  whatever box size fits your banner card and use `BoxFit.cover`/equivalent, since admins can
  upload images of any aspect ratio.
- `inputType` drives the widget: `text` → text field, `dropdown` → options only,
  `both` → options plus a free-text box (the user may type something not in the list).
- `actionValue` for a `whatsapp` action is already resolved from Social Links config.
- If no config has been created yet, `questions` is empty and `banner.isVisible` is
  `false` — render nothing rather than an empty banner.

### `POST /api/profile-questions/answers`

Send one answer, or several. Both shapes work:

```json
{ "questionKey": "targetMarket", "optionValue": "UAE", "textValue": "" }
```

```json
{ "answers": [ { "questionKey": "fullName", "textValue": "Ravi Sharma" } ] }
```

Returns the **same payload as the GET**, so the app can render straight from the response.

Validation (all return `400` with a human-readable `message`):

| Case | Rule |
| --- | --- |
| `text` | `textValue` required, within `maxLength` |
| `dropdown` | `optionValue` required and must be one of `options` |
| `both` | at least one of the two; `optionValue`, if sent, must be in `options` |
| unknown `questionKey` | rejected |
| same key twice in one request | rejected |

Re-answering a question overwrites the previous answer.

## 4. Admin endpoints (ORG_ADMIN / SUPER_ADMIN)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/config` | Current config for the editor |
| `PUT` | `/config` | Full replace; bumps `version` |
| `GET` | `/screen-catalog` | Valid `internal` deep-link targets |

`PUT /config` rejects, with a message naming the offending question:

- duplicate or malformed question keys (must match `/^[a-zA-Z][a-zA-Z0-9_]*$/`)
- a `dropdown` or `both` question with no options
- two questions mapping to the same user field
- an interest-mapped question that is not a dropdown, or whose options fall outside
  Import / Export / Both — anything else would silently break notification targeting
- a banner action that is not valid for that banner, an unknown `internal` screen,
  a link without `http(s)://`, or a `call` action with no number

Banner 1 may only use `open_questionnaire` or `none`. Banner 2 may use
`whatsapp`, `call`, `internal`, `external_url` or `none`.

## 5. Progress

`completionPercentage` counts **required, active** questions only. Optional questions
are collected and displayed but never hold the banner back. With no required questions
configured the user reads as complete rather than dividing by zero.

Question `order` is re-sequenced 1..n on every save, so the popup always walks a
contiguous list.

## 6. Data the calling team sees

`GET /api/user/admin/list` and `/api/user/admin/export` now also return, per user:

```json
{
  "profileAnswers": { "fullName": "Ravi Sharma", "targetMarket": "Other — Kenya" },
  "profileCompletionPercentage": 100,
  "profileIsComplete": true
}
```

A `both` answer carrying an option *and* free text is joined as `"Option — free text"`.

## 7. Changing questions later

Answers are stored against `question.key`, not the label. Reword a question freely;
renaming its key orphans every answer already collected under the old key. The admin
panel warns on keys that exist server-side.

Adding a new required question makes previously-complete users incomplete again, and
the first banner returns for them. That is deliberate — it is how you collect a new
field from people who already finished.
