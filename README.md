# BUILD Facility Course Tracking

Production booking & capacity dashboard for BUILD Sports Performance Lab's facility
at 165 McCaslin Blvd, Louisville CO.

## What it does

- Shows EIM course bookings already on the calendar
- Tracks new tenant bookings (yoga, coaching groups, weeknight rentals, etc.) with hold/locked-in lifecycle
- Visualizes available weekend days and weeknight slots through end of year
- Projects revenue under three scenarios (25/50/75% utilization of unbooked capacity)
- Highlights stale holds past expiration so Savannah can chase or release
- Marks federal holidays + dead holiday-adjacent weekends

## Stack

- **Frontend:** Vanilla HTML/CSS/JS, no framework
- **Backend:** Vercel serverless functions (Node.js 18)
- **Database:** Vercel KV (Redis)
- **Auth:** HMAC-signed cookies, no session DB
- **Deployment:** Vercel

## Files

```
build-facility/
├── DEPLOY.md           — step-by-step first-time deploy guide
├── README.md           — this file
├── package.json        — Node dependencies (just @vercel/kv)
├── vercel.json         — routing config
├── api/
│   ├── auth.js         — login, logout, session check
│   └── bookings.js     — CRUD on bookings (auth-gated)
└── public/
    ├── index.html      — main dashboard (large file, all UI + logic)
    └── login.html      — login page
```

## Pricing model (encoded in the dashboard)

- **Weekend days (Sat/Sun):** $675/day, full-day course hosting
- **Weeknight slots (Mon-Fri 6pm-10pm):** $65/hour × 4 hours = $260 max per weeknight
- **EIM bonus:** +$650 per class with 31+ participants

## Deployment

See `DEPLOY.md` for the full guide. Short version:

1. Push this folder to a private GitHub repo
2. Import to Vercel
3. Set env vars: `USERS_JSON`, `AUTH_SECRET`
4. Connect Vercel KV
5. Deploy

## Maintenance

- **Adding/changing users:** Update `USERS_JSON` env var in Vercel, redeploy.
- **Backups:** Run the backup script in `DEPLOY.md` monthly.
- **Updates:** Edit files, push to GitHub, Vercel auto-deploys.

## Built with

This dashboard was designed iteratively in conversation with Claude. The full design
context (color system, principles, prior versions) lives in conversation memory.
