require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.DATABASE_ID || '1afcc4f11e0b4e62963ab7aef58d631d';

// ─── Email relay (lets classmates message a hidden/anonymous email address) ──
// Configure SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS (and optionally SMTP_FROM)
// in .env to enable this. If unset, the contact endpoint returns a clear error
// instead of silently failing, so the admin knows setup is incomplete.
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

const emailEnabled = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
const mailer = emailEnabled
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    })
  : null;

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
// NOTE: the Edit PIN is intentionally NOT included here — it must never be sent to the browser.
// Same rule applies to the raw email address of anonymous listings: when
// `anonymous` is true we strip the real address and only expose `hasEmail`,
// so classmates can message the person via the contact-relay endpoint
// without ever seeing (or being able to scrape) the hidden address.
function parseRotation(page) {
  const p = page.properties;
  const anonymous = !!p['Anonymous']?.checkbox;
  const rawEmail = p['Email']?.email || '';
  return {
    id: page.id,
    name: p['Name']?.title?.[0]?.text?.content || '',
    anonymous,
    email: anonymous ? '' : rawEmail,
    hasEmail: !!rawEmail,
    phone: p['Phone']?.phone_number || '',
    contactPreference: p['Contact Preference']?.select?.name || '',
    gender: p['Gender']?.select?.name || '',
    healthSystem: p['Health System']?.rich_text?.[0]?.text?.content || '',
    city: p['City']?.rich_text?.[0]?.text?.content || '',
    state: p['State']?.select?.name || '',
    specialty: p['Specialty']?.select?.name || '',
    startDate: p['Start Date']?.date?.start || null,
    endDate: p['End Date']?.date?.start || null,
    notes: p['Notes']?.rich_text?.[0]?.text?.content || '',
    hasPin: !!(p['Edit PIN']?.rich_text?.[0]?.text?.content)
  };
}

// Pull the raw stored PIN off a Notion page (server-side only — never returned to the client)
function getStoredPin(page) {
  return page.properties?.['Edit PIN']?.rich_text?.[0]?.text?.content || '';
}

// Pull the raw stored email off a Notion page (server-side only — used solely
// to relay a message through the contact endpoint; never returned to the client)
function getStoredEmail(page) {
  return page.properties?.['Email']?.email || '';
}

const PIN_PATTERN = /^\d{4}$/;

// Fetch a single rotation page from Notion by ID
async function fetchPage(id) {
  const { data } = await axios.get(`https://api.notion.com/v1/pages/${id}`, { headers: notionHeaders });
  return data;
}

// Verify a submitted PIN against the page's stored PIN. Returns true/false, or null if the page has no PIN set.
async function checkPin(id, submittedPin) {
  const page = await fetchPage(id);
  const storedPin = getStoredPin(page);
  if (!storedPin) return null;
  return storedPin === submittedPin;
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
  const { name, email, phone, contactPreference, gender, healthSystem, city, state, specialty, startDate, endDate, notes, pin, anonymous } = req.body;

  if (!name || !city || !state) {
    return res.status(400).json({ error: 'Name, city, and state are required.' });
  }
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start date and end date are required.' });
  }
  if (!pin || !PIN_PATTERN.test(pin)) {
    return res.status(400).json({ error: 'A 4-digit PIN (numbers only) is required so you can edit or delete this listing later.' });
  }

  const isAnonymous = !!anonymous;

  const properties = {
    'Name': { title: [{ text: { content: name } }] },
    'City': { rich_text: [{ text: { content: city } }] },
    'Start Date': { date: { start: startDate } },
    'End Date': { date: { start: endDate } },
    'Edit PIN': { rich_text: [{ text: { content: pin } }] },
    'Anonymous': { checkbox: isAnonymous }
  };
  if (healthSystem) properties['Health System'] = { rich_text: [{ text: { content: healthSystem } }] };
  if (email) properties['Email'] = { email };
  // Anonymous posts can't share a phone number — ignore any phone value that slips through.
  if (phone && !isAnonymous) properties['Phone'] = { phone_number: phone };
  if (contactPreference) properties['Contact Preference'] = { select: { name: contactPreference } };
  if (gender) properties['Gender'] = { select: { name: gender } };
  if (state) properties['State'] = { select: { name: state } };
  if (specialty) properties['Specialty'] = { select: { name: specialty } };
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

// ─── POST /api/rotations/:id/verify-pin ──────────────────────────────────────
// Checks a submitted PIN against the listing's stored PIN without ever exposing the real value.
app.post('/api/rotations/:id/verify-pin', async (req, res) => {
  const { pin } = req.body;
  if (!pin || !PIN_PATTERN.test(pin)) {
    return res.status(400).json({ error: 'Enter the 4-digit PIN (numbers only).' });
  }
  try {
    const result = await checkPin(req.params.id, pin);
    if (result === null) {
      return res.status(409).json({ error: 'This listing has no PIN on file, so it can’t be edited here.' });
    }
    res.json({ valid: result });
  } catch (err) {
    console.error('Verify PIN error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to verify PIN' });
  }
});

// ─── PATCH /api/rotations/:id ────────────────────────────────────────────────
// Updates a listing — requires the correct PIN.
app.patch('/api/rotations/:id', async (req, res) => {
  const { pin, name, email, phone, contactPreference, gender, healthSystem, city, state, specialty, startDate, endDate, notes, anonymous } = req.body;

  if (!pin || !PIN_PATTERN.test(pin)) {
    return res.status(400).json({ error: 'Enter the 4-digit PIN (numbers only) to edit this listing.' });
  }

  try {
    const match = await checkPin(req.params.id, pin);
    if (match === null) {
      return res.status(409).json({ error: 'This listing has no PIN on file, so it can’t be edited here.' });
    }
    if (!match) {
      return res.status(403).json({ error: 'Incorrect PIN.' });
    }

    const isAnonymous = !!anonymous;

    const properties = {};
    if (name) properties['Name'] = { title: [{ text: { content: name } }] };
    if (city) properties['City'] = { rich_text: [{ text: { content: city } }] };
    if (startDate) properties['Start Date'] = { date: { start: startDate } };
    if (endDate) properties['End Date'] = { date: { start: endDate } };
    properties['Health System'] = { rich_text: healthSystem ? [{ text: { content: healthSystem } }] : [] };
    properties['Email'] = { email: email || null };
    // Anonymous listings can't carry a phone number — clear it out if the toggle is on.
    properties['Phone'] = { phone_number: (phone && !isAnonymous) ? phone : null };
    properties['Anonymous'] = { checkbox: isAnonymous };
    if (contactPreference) properties['Contact Preference'] = { select: { name: contactPreference } };
    if (gender) properties['Gender'] = { select: { name: gender } };
    if (state) properties['State'] = { select: { name: state } };
    if (specialty) properties['Specialty'] = { select: { name: specialty } };
    properties['Notes'] = { rich_text: notes ? [{ text: { content: notes } }] : [] };

    const { data } = await axios.patch(
      `https://api.notion.com/v1/pages/${req.params.id}`,
      { properties },
      { headers: notionHeaders }
    );
    res.json({ success: true, rotation: parseRotation(data) });
  } catch (err) {
    console.error('Update rotation error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to update rotation' });
  }
});

// ─── POST /api/rotations/:id/contact ─────────────────────────────────────────
// Lets a classmate message a listing's email address WITHOUT ever learning
// what that address is — the server looks the stored address up itself
// (same never-expose-to-browser pattern as the Edit PIN) and relays the
// message via SMTP. The sender's own email (if given) is set as Reply-To,
// so the recipient can simply hit "reply" to respond directly.
const CONTACT_BODY_MAX = 4000;
const CONTACT_SUBJECT_MAX = 200;

app.post('/api/rotations/:id/contact', async (req, res) => {
  if (!emailEnabled) {
    return res.status(503).json({
      error: 'The site admin hasn’t set up email sending yet, so messages can’t be relayed right now. Ask them to configure SMTP_HOST/SMTP_USER/SMTP_PASS in .env (see SETUP.md).'
    });
  }

  const { subject, message, replyTo } = req.body || {};
  const trimmedSubject = (subject || '').toString().trim();
  const trimmedMessage = (message || '').toString().trim();

  if (!trimmedSubject || !trimmedMessage) {
    return res.status(400).json({ error: 'A subject and message are both required.' });
  }
  if (trimmedSubject.length > CONTACT_SUBJECT_MAX) {
    return res.status(400).json({ error: `Subject must be ${CONTACT_SUBJECT_MAX} characters or fewer.` });
  }
  if (trimmedMessage.length > CONTACT_BODY_MAX) {
    return res.status(400).json({ error: `Message must be ${CONTACT_BODY_MAX} characters or fewer.` });
  }
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    return res.status(400).json({ error: 'That reply-to email address doesn’t look valid.' });
  }

  try {
    const page = await fetchPage(req.params.id);
    const recipient = getStoredEmail(page);
    if (!recipient) {
      return res.status(409).json({ error: 'This listing doesn’t have an email on file, so it can’t be messaged this way.' });
    }

    const recipientName = page.properties?.['Name']?.title?.[0]?.text?.content || 'there';

    await mailer.sendMail({
      from: SMTP_FROM,
      to: recipient,
      replyTo: replyTo || undefined,
      subject: `[Rotation Portal] ${trimmedSubject}`,
      text:
        `Hi ${recipientName},\n\n` +
        `A classmate sent you a message through the Rotation Portal without seeing your email address:\n\n` +
        `${trimmedMessage}\n\n` +
        (replyTo
          ? `You can reply directly to this email to reach them at ${replyTo}.\n\n`
          : `They didn't share a return address, so you won't be able to reply directly — consider posting your own contact info if you'd like to hear back.\n\n`) +
        `— Rotation Portal`
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Contact relay error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to send your message. Please try again later.' });
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
// Requires the correct 4-digit PIN in the request body: { "pin": "1234" }
app.delete('/api/rotations/:id', async (req, res) => {
  const { pin } = req.body || {};
  if (!pin || !PIN_PATTERN.test(pin)) {
    return res.status(400).json({ error: 'Enter the 4-digit PIN (numbers only) to delete this listing.' });
  }

  try {
    const match = await checkPin(req.params.id, pin);
    if (match === null) {
      return res.status(409).json({ error: 'This listing has no PIN on file, so it can’t be deleted here.' });
    }
    if (!match) {
      return res.status(403).json({ error: 'Incorrect PIN.' });
    }

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
  if (!emailEnabled) {
    console.warn('⚠️  Email relay is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing). The "Message via portal" contact feature for anonymous listings will be disabled until you set these in .env — see SETUP.md.\n');
  }
});
