require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.DATABASE_ID || '1afcc4f11e0b4e62963ab7aef58d631d';

const notionHeaders = {
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28'
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Geocoding cache + rate limiting ────────────────────────────────────────
const geocodeCache = {};
let lastNominatimCall = 0;

async function geocode(city, state) {
  const key = `${city},${state}`.toLowerCase();
  if (geocodeCache[key]) return geocodeCache[key];

  // Rate limit: Nominatim allows 1 req/sec
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastNominatimCall));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastNominatimCall = Date.now();

  try {
    const q = encodeURIComponent(`${city}, ${state}, USA`);
    const { data } = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'User-Agent': 'MedSchoolRotationPortal/1.0 (gtran021@ucr.edu)' } }
    );
    if (data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache[key] = result;
      return result;
    }
  } catch (err) {
    console.error('Geocode error:', err.message);
  }
  return { lat: null, lng: null };
}

// ─── Parse a Notion page into a flat rotation object ─────────────────────────
function parseRotation(page) {
  const p = page.properties;
  return {
    id: page.id,
    name: p['Name']?.title?.[0]?.text?.content || '',
    email: p['Email']?.email || '',
    healthSystem: p['Health System']?.rich_text?.[0]?.text?.content || '',
    city: p['City']?.rich_text?.[0]?.text?.content || '',
    state: p['State']?.select?.name || '',
    specialty: p['Specialty']?.select?.name || '',
    startDate: p['Start Date']?.date?.start || null,
    endDate: p['End Date']?.date?.start || null,
    notes: p['Notes']?.rich_text?.[0]?.text?.content || ''
  };
}

// ─── GET /api/rotations ──────────────────────────────────────────────────────
app.get('/api/rotations', async (req, res) => {
  try {
    const allResults = [];
    let cursor = undefined;

    do {
      const body = {
        sorts: [{ property: 'Start Date', direction: 'ascending' }],
        page_size: 100
      };
      if (cursor) body.start_cursor = cursor;

      const { data } = await axios.post(
        `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
        body,
        { headers: notionHeaders }
      );

      allResults.push(...data.results.map(parseRotation));
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    res.json(allResults);
  } catch (err) {
    console.error('Fetch rotations error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch rotations' });
  }
});

// ─── POST /api/rotations ─────────────────────────────────────────────────────
app.post('/api/rotations', async (req, res) => {
  const { name, email, healthSystem, city, state, specialty, startDate, endDate, notes } = req.body;

  if (!name || !city || !state) {
    return res.status(400).json({ error: 'Name, city, and state are required.' });
  }

  const properties = {
    'Name': { title: [{ text: { content: name } }] },
    'Health System': { rich_text: [{ text: { content: healthSystem || '' } }] },
    'City': { rich_text: [{ text: { content: city } }] }
  };
  if (email) properties['Email'] = { email };
  if (state) properties['State'] = { select: { name: state } };
  if (specialty) properties['Specialty'] = { select: { name: specialty } };
  if (startDate) properties['Start Date'] = { date: { start: startDate } };
  if (endDate) properties['End Date'] = { date: { start: endDate } };
  if (notes) properties['Notes'] = { rich_text: [{ text: { content: notes } }] };

  try {
    const { data } = await axios.post(
      'https://api.notion.com/v1/pages',
      { parent: { database_id: DATABASE_ID }, properties },
      { headers: notionHeaders }
    );
    res.json({ success: true, rotation: parseRotation(data) });
  } catch (err) {
    console.error('Create rotation error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to save rotation' });
  }
});

// ─── GET /api/geocode?city=X&state=Y ─────────────────────────────────────────
app.get('/api/geocode', async (req, res) => {
  const { city, state } = req.query;
  if (!city || !state) return res.status(400).json({ error: 'city and state required' });
  const result = await geocode(city, state);
  res.json(result);
});

// ─── DELETE /api/rotations/:id ───────────────────────────────────────────────
app.delete('/api/rotations/:id', async (req, res) => {
  try {
    await axios.patch(
      `https://api.notion.com/v1/pages/${req.params.id}`,
      { archived: true },
      { headers: notionHeaders }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Delete rotation error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to delete rotation' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🩺  Rotation Portal → http://localhost:${PORT}\n`);
  if (!NOTION_TOKEN || NOTION_TOKEN.includes('xxx')) {
    console.warn('⚠️  NOTION_TOKEN is not set. Copy .env.example → .env and add your token.\n');
  }
});
