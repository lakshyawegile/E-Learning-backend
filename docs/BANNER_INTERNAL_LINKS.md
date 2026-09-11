# Dashboard Banner — Internal Navigation Reference

**Audience:** Backend / Admin panel team
**Client status:** Implemented and live — no client release is required to start using this.

---

## 1. Overview

Dashboard banners (the home-screen carousel and the inline banners) currently
only support opening an external URL when tapped. This adds a second option:
a banner can instead navigate the user **directly to a screen inside the
app**.

No new field, no schema change. This reuses the **existing** `linkUrl` /
`ctaUrl` field that banners already send. The only change needed on your
side is *what value* you put in it.

## 2. How it works

When a user taps a banner, the app checks the `linkUrl` value against a
fixed list of recognized internal-page identifiers (Section 4).

- **Match found** → the app opens that screen directly, in-app.
- **No match** → the app falls back to its current behavior and opens the
  value as a normal external URL in the browser.

This means the change is fully backward compatible: every banner you've
already configured with a real `https://...` URL keeps working exactly as
it does today. You only need to use one of the values below for the banners
where you specifically want an in-app redirect.

## 3. Format requirements

Matching is **exact**:

- Case-sensitive
- No leading/trailing whitespace
- No trailing slash
- Must match a value from the table in Section 4 character-for-character

If a value doesn't match exactly, it is treated as an external URL (see
Section 2) — it will not crash or error, but it also won't open the
intended screen.

## 4. Supported internal pages

| `linkUrl` value | Destination screen |
|---|---|
| `premium://premium-features` | Premium Features page |
| `one-on-one://one-on-one` | One-on-One Classes page |
| `courses://list` | Courses list |
| `news://list` | News list |
| `shorts://feed` | Shorts feed |
| `community://chat` | Community chat |
| `quiz://topics` | Quiz topics |
| `tools://all` | All Tools page |
| `gallery://home` | Gallery |
| `profile://me` | Profile |
| `journey://import` | Import Journey |
| `journey://export` | Export Journey |
| `consultation://book` | Free counseling / consultation booking |
| `tools://export-price` | Export Price Calculator |
| `tools://import-calc` | Import Calculator |
| `tools://cbm` | CBM Calculator |
| `tools://gst` | GST Calculator |
| `tools://hsn-finder` | HSN Finder |
| `tools://forex` | Forex Converter |
| `tools://forex-rates` | Forex Rates List |
| `tools://gov-benefits` | Government Benefits |
| `tools://incoterms` | Incoterms Guide |
| `tools://product-cert` | Product Certification |

### Example

To make a carousel banner open the Premium page on tap, set:

```json
{
  "imageUrl": "https://.../banner.png",
  "linkUrl": "premium://premium-features",
  "isActive": true
}
```

## 5. Not yet supported

Deep-linking to a **specific item** — one particular news article, course,
or webinar, rather than the general list — is not available yet. The
client-side convention for that would look like:

```
news://<newsId>
course://<courseId>
webinar://<seminarId>
```

This requires the admin panel to let the person creating the banner pick
the specific news article / course / webinar, so its ID can be embedded in
the link. That picker UI doesn't exist yet, so please don't send these
forms — they won't resolve to anything on the client until that's built.
Let us know if/when this is prioritized and we'll confirm the client is
ready to receive it.

## 6. Reference — implementation location

For context, this is handled entirely client-side:

- Resolver: `lib/core/services/internal_link_router.dart`
- Consumed by: `cta_carasoul.dart` (carousel banners) and
  `inline_banner.dart` (inline banners)
- Uses the same `scheme://path` convention already established for
  push-notification deep-links (`notification_router.dart`, `type: "premium"`
  / `type: "one-on-one"` / etc.), so the two systems stay consistent.
