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
| Name | Title | Student's full name (or a random animal nickname if posted anonymously) |
| Gender | Select | Male / Female / Non-binary (optional) |
| Email | Email | Optional contact — a hint reminds students to use a personal address (not their school email) if posting anonymously |
| Phone | Phone Number | Optional contact |
| Contact Preference | Select | Email / Phone / Both — controls what's shown when a classmate clicks "Contact" |
| Health System | Text | Hospital/health system name (optional) |
| City | Text | Rotation city |
| State | Select | US state |
| Specialty | Select | Rotation type |
| Start Date | Date | Rotation start (required) |
| End Date | Date | Rotation end (required) |
| Notes | Text | Hobbies/interests and Airbnb or rent-sharing preferences |
| Edit PIN | Text | Private 4-digit PIN the student sets so they can edit/delete their own listing later (never shown to classmates) |

Email and phone are hidden on the main view by default — classmates click "Contact" on a card to reveal whichever info the person chose to share, based on their stated preference.

Posting anonymously now only hides your name — you'll appear under a randomly generated nickname (e.g. "Sneaky Platypus"), Google Docs–style. Your email stays optional and visible if you choose to fill it in (the form reminds you to use a personal address, not your school email, so your identity stays hidden). Your phone, gender, location, dates, specialty, and notes are still shared as entered.

You can edit/delete entries directly in Notion at any time.

---

## Other Form Improvements

- **Specialty list**: Expanded to a full alphabetized list of ~44 specialties, including all the ones you requested plus IM/FM sub-specialties (Sports Medicine, Pain Medicine, Addiction Medicine, Pulmonology, Gastroenterology, Endocrinology, Nephrology, Rheumatology, Infectious Disease, etc.). The "(Integrated)" suffix has been removed from Interventional Radiology, Plastic Surgery, Thoracic Surgery, and Vascular Surgery.
- **Rotation-block filter**: The sidebar's "filter by specialty" dropdown has been replaced with a searchable, grouped dropdown of your school's official 4th-year rotation blocks (Slot 2 – Slot 11, including the "a"/"b" sub-blocks for 2026–2027). Selecting a block shows everyone whose date range overlaps it.
- **Block vs. custom dates on the form**: When adding a rotation, students choose how to enter their dates — "Choose a school rotation block" (auto-fills Start/End Date from the selected block) or "Enter specific dates" (manual date pickers, for rotations that don't line up with a designated block).
- **End Date auto-fill**: Choosing a Start Date automatically sets the End Date to match (and prevents picking an End Date earlier than the Start Date), so students don't have to click through the date picker from scratch.
- **City autocomplete**: The City field now suggests matches from a bundled US-cities reference list (`public/data/us-cities.json`) as you type, and selecting a suggestion auto-fills the matching State.
- **Bigger, mobile-friendly form**: The "Add My Rotation" panel is wider on desktop (no more horizontal scrolling to see every field) and switches to a full-width, bottom-sheet layout on phones/narrow screens, with the date-mode choice stacking vertically.
- **Edit & delete your own listing**: When adding a rotation, students set a private 4-digit PIN (numbers only). An "✏️ Edit" button then appears on their card — clicking it asks for that PIN, and once verified opens a form to update their info or permanently delete the listing. The PIN is stored in the "Edit PIN" Notion column and is never sent to other classmates' browsers — make sure students remember their PIN, since there's no recovery flow (you can always look it up or clear it directly in Notion if someone forgets).
- **ERAS region color-coding**: Map markers, the dashboard listing groups, and the map's state choropleth layer are all color-coded by official ERAS region (New England, Middle Atlantic, East/West North Central, South Atlantic, East/West South Central, Mountain, Pacific), based on each rotation's state. The sidebar groups listings by region (alphabetical by region name, with classmates sorted alphabetically by name within each group), and a legend in the map's bottom-right corner shows which color maps to which region.
