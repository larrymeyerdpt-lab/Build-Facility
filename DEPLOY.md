# BUILD Facility Course Tracking — Deployment Guide

This guide walks you through deploying your dashboard to Vercel so you and Savannah
can both access it from a real URL.

**Total time: ~30 minutes for a first deploy.**

---

## What you'll end up with

- A real URL (like `build-facility.vercel.app` or your own domain)
- Two separate logins: one for you (Larry), one for Savannah
- A real shared database — bookings you create are visible to her, and vice versa
- Every booking stamped with who created/edited it
- Free hosting at your scale (Vercel KV free tier covers ~30k operations/day)

---

## Prerequisites

Before you begin, you'll need:

1. **A GitHub account** (free — sign up at github.com if you don't have one)
2. **A Vercel account** (free — sign up at vercel.com, easiest to "Continue with GitHub")
3. **Node.js installed locally** (only if you want to test before deploying — optional)
4. **About 30 minutes of uninterrupted time**

---

## Step 1 — Get the project files into a folder

Download all four files from this conversation:

```
build-facility/
├── package.json
├── vercel.json
├── api/
│   ├── auth.js
│   └── bookings.js
└── public/
    ├── index.html
    └── login.html
```

Make sure the folder structure is exactly as shown — Vercel expects API routes
in `/api` and static files in `/public`.

---

## Step 2 — Push the project to GitHub

The easiest way: use the GitHub website's drag-and-drop.

1. Go to github.com and click **"New repository"** (green button, top-right of any page)
2. Name it `build-facility` (or whatever you like)
3. Set it to **Private** (this is your operations data — keep it private)
4. Click **"Create repository"**
5. On the next page, click **"uploading an existing file"** (it's a small link in the middle of the page)
6. Drag your `build-facility` folder contents into the upload area
7. Click **"Commit changes"** at the bottom

Your code is now on GitHub.

---

## Step 3 — Create a Vercel project

1. Go to **vercel.com/new**
2. Click **"Import Git Repository"**
3. Find your `build-facility` repo and click **"Import"**
4. **DO NOT click Deploy yet.** First we need to set environment variables (Step 4)
5. Expand the **"Environment Variables"** section

---

## Step 4 — Set environment variables

You need to add three secret values. Stay on the deployment configuration page.

### Variable 1 — `USERS_JSON`

This holds the username/password pairs for everyone who can log in.

- **Name:** `USERS_JSON`
- **Value:** `{"larry":"YOUR_PASSWORD_HERE","savannah":"HER_PASSWORD_HERE"}`

⚠️ **Important:**
- Choose strong passwords (12+ characters, mix of letters, numbers, symbols)
- Don't use spaces in passwords
- The format must be valid JSON — quotes around every key and value, commas between
- Usernames are lowercase

Example of a valid value (use your own passwords):
```
{"larry":"Th3-McCaslin-Way!2026","savannah":"BUILD-Lou1sville#Ops"}
```

### Variable 2 — `AUTH_SECRET`

This is used to sign authentication cookies. Make it a long random string.

- **Name:** `AUTH_SECRET`
- **Value:** A 32+ character random string of your choice

You can generate one by running this in your terminal:
```
openssl rand -hex 32
```

Or use any random password generator and pick a 40-character output. Just make
sure it's random and at least 32 characters. Example:
```
9f3a7d8c2b1e4f5a6d7c8b9a0f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e
```

### Variable 3 — Vercel KV (added in Step 5)

You don't add this manually — Vercel adds it automatically when you create the
KV database. Move on to Step 5.

---

## Step 5 — Click Deploy (first deploy fails — that's expected!)

Click the **"Deploy"** button. Wait ~1 minute. You will probably see one of two outcomes:

- ✅ **Deploy succeeds** → Move to Step 6
- ⚠️ **Deploy fails because KV isn't set up yet** → That's fine, this is normal. Continue with Step 6 — we're about to set it up.

---

## Step 6 — Add Vercel KV (the database)

1. From your project dashboard on Vercel, click the **"Storage"** tab at the top
2. Click **"Create Database"**
3. Choose **"KV"** (the Redis-compatible option)
4. Name it `build-facility-kv` or similar
5. Choose a region close to you (e.g., `Washington, D.C.` for US East)
6. Click **"Create"**
7. On the next page, click **"Connect to Project"** and select `build-facility`
8. Vercel automatically adds the necessary environment variables (`KV_URL`, `KV_REST_API_URL`, etc.)

---

## Step 7 — Redeploy

Now that KV is connected, redeploy the project:

1. Go to the **"Deployments"** tab
2. Click the three-dot menu on the latest deployment
3. Click **"Redeploy"**
4. Confirm

After ~1 minute, the deployment should succeed.

---

## Step 8 — Test it

1. Click the URL Vercel shows you (something like `build-facility-xxxx.vercel.app`)
2. You should see the login page
3. Sign in with your username (`larry`) and the password from `USERS_JSON`
4. You should see the dashboard
5. Click an available green or white day on the calendar
6. Fill in a test booking, save it
7. Sign out, sign in as `savannah` (in a different browser or incognito window)
8. Verify Savannah sees your test booking

If both of those work — **you're live**. 🎉

---

## Step 9 (optional) — Custom domain

If you want a friendlier URL like `facility.buildyou.co`:

1. In Vercel, go to **Settings → Domains** for this project
2. Add `facility.buildyou.co` (or whatever subdomain)
3. Vercel shows you a CNAME record to add to your DNS provider (probably GoDaddy or Cloudflare for `buildyou.co`)
4. Add that CNAME record in your DNS provider
5. Wait 5-30 minutes for DNS to propagate
6. The dashboard is now at your custom domain

---

## How to give Savannah access

Just send her:
- The URL (your Vercel URL or custom domain)
- Her username (`savannah`)
- Her password (whatever you set in `USERS_JSON`)

Tell her to bookmark it. Done.

---

## How to change a password

1. Go to your Vercel project → **Settings → Environment Variables**
2. Find `USERS_JSON` and click the three-dot menu → **Edit**
3. Update the password in the JSON
4. Save
5. Redeploy (Deployments tab → three-dot menu → Redeploy)

---

## How to add another user

Same as changing a password — edit `USERS_JSON` and add another key/value pair:
```
{"larry":"...","savannah":"...","new_person":"their_password"}
```

Then redeploy.

---

## How to back up your bookings

Vercel KV has automatic backups, but you should still keep your own copy.
A simple way: in the dashboard, open the browser console (right-click → Inspect → Console)
and run:

```javascript
fetch('/api/bookings').then(r => r.json()).then(d => {
  const blob = new Blob([JSON.stringify(d.bookings, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bookings-backup-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
});
```

This downloads a JSON file with all your bookings. Do this monthly.

(Future improvement: I can add a "Export bookings" button in the UI if you want.)

---

## Troubleshooting

### "Sign-in failed"
Most common cause: password mismatch. Check that the password you typed matches what's in `USERS_JSON`. Remember usernames are lowercase.

### "Could not load bookings"
Most common cause: Vercel KV isn't connected. Verify in Storage tab that the KV database is linked to the project. Redeploy after connecting.

### "Server error" when saving
Check the Vercel deployment logs (Deployments tab → click a deployment → "Functions" → click `/api/bookings` to see logs).

### I forgot the AUTH_SECRET — what now?
Generate a new one and update it in Vercel environment variables. All current sessions will be logged out and you'll need to sign in again. No data is lost.

---

## What this costs

- **Vercel hosting:** Free tier (Hobby plan). Plenty for two users.
- **Vercel KV:** Free tier covers ~30,000 operations/day. You'll use maybe 100/day. Plenty.
- **GitHub:** Free for private repos.
- **Custom domain (optional):** Whatever you pay for the domain (~$12-15/year).

**Realistic monthly cost: $0.** If you ever exceed Vercel's free tier (you won't), you'll be the first to know — they email you well before charging.

---

## Maintenance — what you actually have to do

- **Monthly:** Run the backup snippet above and save the JSON somewhere safe.
- **When passwords leak or staff change:** Update `USERS_JSON` and redeploy.
- **When you want to update the dashboard:** Edit files, push to GitHub, Vercel auto-deploys.
- **Otherwise:** Nothing. It just runs.

---

## You did it.

Bookmark the URL. Add it to your home screen. Use it Monday.

If anything breaks or feels off, come back to Claude and say "the booking dashboard
is doing X" — I'll have the full context from this conversation in memory.
