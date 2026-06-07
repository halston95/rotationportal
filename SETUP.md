# 4th Year Rotation Portal — Setup Guide

## What You Built
A website your class can use to see who's rotating where on an interactive US map.
- Click any city marker to see classmates rotating there and their date ranges
- Filter by specialty or date window
- Students submit their own rotation via a form (saved to your Notion database)

---

## Step 1 — Create a Notion Integration Token

1. Go to **https://www.notion.so/my-integrations**
2. Click **+ New integration**
3. Give it a name (e.g., "Rotation Portal")
4. Select your workspace
5. Under **Capabilities**, make sure Read, Update, and Insert are all checked
6. Click **Submit**, then copy the **Internal Integration Secret** (starts with `secret_...`)

---

## Step 2 — Share the Database with Your Integration

1. Open Notion and find the **"4th Year Rotations"** database (just created for you)
2. Click the **⋯** (three dots) menu in the top right of the database
3. Click **Add connections** and find your "Rotation Portal" integration
4. Click **Confirm**

---

## Step 3 — Configure Your Environment

In the `rotation-portal` folder:
```bash
cp .env.example .env
```
Open `.env` and paste your token:
```
NOTION_TOKEN=secret_your_token_here
DATABASE_ID=1afcc4f11e0b4e62963ab7aef58d631d
PORT=3000
```

---

## Step 4 — Install Dependencies & Run

Make sure you have **Node.js** installed (https://nodejs.org — LTS version).

```bash
cd rotation-portal
npm install
npm start
```

Open your browser to **http://localhost:3000** — you should see the portal!

---

## Step 5 — Share with Your Class

To share with classmates, you have a few options:

**Option A — Run locally (simplest):** Each person who manages it runs it on their own computer.

**Option B — Deploy free to Render.com:**
1. Push the `rotation-portal` folder to a GitHub repo
2. Create a free account at https://render.com
3. New → Web Service → connect your repo
4. Set `NOTION_TOKEN` and `DATABASE_ID` as environment variables in Render's dashboard
5. Render gives you a public URL to share with the class

**Option C — Deploy to Railway.app:** Similar to Render, also free tier available.

---

## How Classmates Add Their Info

They just visit the site and click **"Add My Rotation"** in the top right. Their submission goes straight into your Notion database and appears on the map immediately.

---

## Notion Database Fields

| Field | Type | Notes |
|-------|------|-------|
| Name | Title | Student's full name |
| Email | Email | Optional contact |
| Health System | Text | Hospital/health system name |
| City | Text | Rotation city |
| State | Select | US state |
| Specialty | Select | Rotation type |
| Start Date | Date | Rotation start |
| End Date | Date | Rotation end |
| Notes | Text | Housing tips, area recs, etc. |

You can edit/delete entries directly in Notion at any time.
