// api/bookings.js (Postgres edition v3 — direct JSONB binding)
// CRUD for facility bookings, backed by Neon Postgres via @vercel/postgres.
//
// Key change from v2: passes JavaScript objects directly to JSONB columns
// without ::jsonb cast. @vercel/postgres template tag handles serialization.

import { sql } from '@vercel/postgres';
import { getUserFromRequest } from './auth.js';

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS bookings (
      id            TEXT PRIMARY KEY,
      dates         TEXT[] NOT NULL,
      slot_type     TEXT NOT NULL,
      renter_name   TEXT NOT NULL,
      contact_name  TEXT NOT NULL,
      company       TEXT,
      contact_info  TEXT NOT NULL,
      rate_quoted   NUMERIC NOT NULL,
      status        TEXT NOT NULL,
      hold_expires  DATE,
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL,
      created_by    TEXT NOT NULL,
      updated_at    TIMESTAMPTZ NOT NULL,
      updated_by    TEXT NOT NULL,
      locked_at     TIMESTAMPTZ,
      locked_by     TEXT
    );
  `;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS portfolio_features TEXT[];`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS portfolio_sent JSONB;`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS janeapp_checked JSONB;`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS agreement_sent JSONB;`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS agreement_received JSONB;`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS agreement_filed JSONB;`;
  await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS comms_log JSONB;`;
  await sql`CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status);`;
  schemaReady = true;
}

function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// Convert a JS value to a JSON string for JSONB column, or null
function toJsonb(value) {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

// Convert a database row back into the JSON shape the frontend expects
function rowToBooking(r) {
  return {
    id: r.id,
    dates: r.dates,
    slotType: r.slot_type,
    renterName: r.renter_name,
    contactName: r.contact_name,
    company: r.company || '',
    contactInfo: r.contact_info,
    rateQuoted: parseFloat(r.rate_quoted),
    status: r.status,
    holdExpires: r.hold_expires
      ? (typeof r.hold_expires === 'string' ? r.hold_expires.slice(0, 10) : r.hold_expires.toISOString().slice(0, 10))
      : null,
    notes: r.notes || '',
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    updatedBy: r.updated_by,
    lockedAt: r.locked_at ? (r.locked_at instanceof Date ? r.locked_at.toISOString() : r.locked_at) : null,
    lockedBy: r.locked_by || null,
    portfolioFeatures: r.portfolio_features || [],
    portfolioSent: r.portfolio_sent || null,
    janeappChecked: r.janeapp_checked || null,
    agreementSent: r.agreement_sent || null,
    agreementReceived: r.agreement_received || null,
    agreementFiled: r.agreement_filed || null,
    commsLog: r.comms_log || []
  };
}

function validateBookingPayload(b) {
  const errors = [];
  if (!Array.isArray(b.dates) || b.dates.length === 0) errors.push('dates must be non-empty array');
  if (b.dates && !b.dates.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d))) errors.push('all dates must be YYYY-MM-DD');
  if (!b.renterName || typeof b.renterName !== 'string' || b.renterName.length > 200) errors.push('renterName required (max 200 chars)');
  if (!b.contactName || typeof b.contactName !== 'string' || b.contactName.length > 200) errors.push('contactName required (max 200 chars)');
  if (!b.contactInfo || typeof b.contactInfo !== 'string' || b.contactInfo.length > 500) errors.push('contactInfo required (max 500 chars)');
  if (typeof b.rateQuoted !== 'number' || b.rateQuoted < 0 || b.rateQuoted > 1000000) errors.push('rateQuoted must be a non-negative number');
  if (!['hold', 'locked'].includes(b.status)) errors.push('status must be "hold" or "locked"');
  if (b.status === 'hold' && b.holdExpires && !/^\d{4}-\d{2}-\d{2}$/.test(b.holdExpires)) errors.push('holdExpires must be YYYY-MM-DD');
  if (b.company && (typeof b.company !== 'string' || b.company.length > 200)) errors.push('company max 200 chars');
  if (b.notes && (typeof b.notes !== 'string' || b.notes.length > 2000)) errors.push('notes max 2000 chars');
  if (!['weekend', 'weeknight', 'mixed'].includes(b.slotType)) errors.push('slotType must be weekend/weeknight/mixed');
  return errors;
}

export default async function handler(req, res) {
  // Wrap EVERYTHING in try/catch so any error becomes a useful response
  // instead of crashing the function and giving a generic FUNCTION_INVOCATION_FAILED
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'not_authenticated' });
    }

    await ensureSchema();

    if (req.method === 'GET') {
      const { rows } = await sql`SELECT * FROM bookings ORDER BY dates[1] ASC;`;
      return res.status(200).json({ ok: true, bookings: rows.map(rowToBooking) });
    }

    if (req.method === 'POST') {
      const payload = req.body || {};
      const errors = validateBookingPayload(payload);
      if (errors.length) return res.status(400).json({ ok: false, errors });

      const id = newId();
      const now = new Date().toISOString();
      const lockedAt = payload.status === 'locked' ? now : null;
      const lockedBy = payload.status === 'locked' ? user.username : null;
      const holdExpires = payload.status === 'hold' ? (payload.holdExpires || null) : null;

      const portfolioFeatures = Array.isArray(payload.portfolioFeatures) ? payload.portfolioFeatures : [];
      const portfolioSentJson = toJsonb(payload.portfolioSent);
      const janeappCheckedJson = toJsonb(payload.janeappChecked);
      const agreementSentJson = toJsonb(payload.agreementSent);
      const agreementReceivedJson = toJsonb(payload.agreementReceived);
      const agreementFiledJson = toJsonb(payload.agreementFiled);
      const commsLogJson = toJsonb(Array.isArray(payload.commsLog) ? payload.commsLog : []);

      const { rows } = await sql`
        INSERT INTO bookings (
          id, dates, slot_type, renter_name, contact_name, company, contact_info,
          rate_quoted, status, hold_expires, notes,
          created_at, created_by, updated_at, updated_by, locked_at, locked_by,
          portfolio_features, portfolio_sent, janeapp_checked,
          agreement_sent, agreement_received, agreement_filed, comms_log
        ) VALUES (
          ${id},
          ${payload.dates},
          ${payload.slotType},
          ${payload.renterName.trim()},
          ${payload.contactName.trim()},
          ${(payload.company || '').trim()},
          ${payload.contactInfo.trim()},
          ${payload.rateQuoted},
          ${payload.status},
          ${holdExpires},
          ${(payload.notes || '').trim()},
          ${now},
          ${user.username},
          ${now},
          ${user.username},
          ${lockedAt},
          ${lockedBy},
          ${portfolioFeatures},
          ${portfolioSentJson},
          ${janeappCheckedJson},
          ${agreementSentJson},
          ${agreementReceivedJson},
          ${agreementFiledJson},
          ${commsLogJson}
        )
        RETURNING *;
      `;
      return res.status(201).json({ ok: true, booking: rowToBooking(rows[0]) });
    }

    if (req.method === 'PUT') {
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: 'id_required' });

      const existing = await sql`SELECT * FROM bookings WHERE id = ${id};`;
      if (existing.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'booking_not_found' });
      }
      const existingBooking = rowToBooking(existing.rows[0]);
      const merged = { ...existingBooking, ...updates };
      const errors = validateBookingPayload(merged);
      if (errors.length) return res.status(400).json({ ok: false, errors });

      const now = new Date().toISOString();
      let lockedAt = existing.rows[0].locked_at;
      let lockedBy = existing.rows[0].locked_by;
      if (merged.status === 'locked' && existingBooking.status !== 'locked') {
        lockedAt = now; lockedBy = user.username;
      }
      if (merged.status === 'hold' && existingBooking.status === 'locked') {
        lockedAt = null; lockedBy = null;
      }
      const holdExpires = merged.status === 'hold' ? (merged.holdExpires || null) : null;

      const portfolioFeatures = Array.isArray(merged.portfolioFeatures) ? merged.portfolioFeatures : [];
      const portfolioSentJson = toJsonb(merged.portfolioSent);
      const janeappCheckedJson = toJsonb(merged.janeappChecked);
      const agreementSentJson = toJsonb(merged.agreementSent);
      const agreementReceivedJson = toJsonb(merged.agreementReceived);
      const agreementFiledJson = toJsonb(merged.agreementFiled);
      const commsLogJson = toJsonb(Array.isArray(merged.commsLog) ? merged.commsLog : []);

      const { rows } = await sql`
        UPDATE bookings SET
          dates              = ${merged.dates},
          slot_type          = ${merged.slotType},
          renter_name        = ${merged.renterName.trim()},
          contact_name       = ${merged.contactName.trim()},
          company            = ${(merged.company || '').trim()},
          contact_info       = ${merged.contactInfo.trim()},
          rate_quoted        = ${merged.rateQuoted},
          status             = ${merged.status},
          hold_expires       = ${holdExpires},
          notes              = ${(merged.notes || '').trim()},
          updated_at         = ${now},
          updated_by         = ${user.username},
          locked_at          = ${lockedAt},
          locked_by          = ${lockedBy},
          portfolio_features = ${portfolioFeatures},
          portfolio_sent     = ${portfolioSentJson},
          janeapp_checked    = ${janeappCheckedJson},
          agreement_sent     = ${agreementSentJson},
          agreement_received = ${agreementReceivedJson},
          agreement_filed    = ${agreementFiledJson},
          comms_log          = ${commsLogJson}
        WHERE id = ${id}
        RETURNING *;
      `;
      return res.status(200).json({ ok: true, booking: rowToBooking(rows[0]) });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
      const result = await sql`DELETE FROM bookings WHERE id = ${id} RETURNING id;`;
      if (result.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'booking_not_found' });
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    // Comprehensive error logging — both to Vercel logs AND to the response
    // so we can see what actually failed
    const errorDetail = {
      message: err?.message || String(err),
      code: err?.code || null,
      stack: err?.stack || null,
      name: err?.name || null
    };
    console.error('Bookings API error:', JSON.stringify(errorDetail, null, 2));
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      detail: errorDetail.message,
      code: errorDetail.code
    });
  }
}
