// api/bookings.js
// CRUD for facility bookings, backed by Vercel KV.
// Storage shape:
//   KV key 'bookings:index' -> JSON array of booking IDs
//   KV key 'booking:<id>'   -> JSON object with full booking data
//
// A booking object:
// {
//   id: string (unix-ms + random suffix),
//   dates: ['2026-06-15', '2026-06-16', ...],   // array of YYYY-MM-DD
//   slotType: 'weekend' | 'weeknight' | 'mixed',
//   renterName: string,
//   contactName: string,
//   company: string,
//   contactInfo: string,
//   rateQuoted: number,
//   status: 'hold' | 'locked',
//   holdExpires: 'YYYY-MM-DD' | null,
//   notes: string,
//   createdAt: ISO timestamp,
//   createdBy: username,
//   updatedAt: ISO timestamp,
//   updatedBy: username,
//   lockedAt: ISO timestamp | null,
//   lockedBy: username | null
// }

import { kv } from '@vercel/kv';
import { getUserFromRequest } from './auth.js';

const INDEX_KEY = 'bookings:index';

function bookingKey(id) { return `booking:${id}`; }

function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function getIndex() {
  const idx = await kv.get(INDEX_KEY);
  return Array.isArray(idx) ? idx : [];
}
async function setIndex(arr) {
  await kv.set(INDEX_KEY, arr);
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

async function getAllBookings() {
  const index = await getIndex();
  if (index.length === 0) return [];
  const keys = index.map(bookingKey);
  const results = await Promise.all(keys.map(k => kv.get(k)));
  return results.filter(Boolean);
}

export default async function handler(req, res) {
  // Auth check on every request
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'not_authenticated' });
  }

  try {
    if (req.method === 'GET') {
      const bookings = await getAllBookings();
      return res.status(200).json({ ok: true, bookings });
    }

    if (req.method === 'POST') {
      const payload = req.body || {};
      const errors = validateBookingPayload(payload);
      if (errors.length) return res.status(400).json({ ok: false, errors });

      const now = new Date().toISOString();
      const booking = {
        id: newId(),
        dates: payload.dates,
        slotType: payload.slotType,
        renterName: payload.renterName.trim(),
        contactName: payload.contactName.trim(),
        company: (payload.company || '').trim(),
        contactInfo: payload.contactInfo.trim(),
        rateQuoted: payload.rateQuoted,
        status: payload.status,
        holdExpires: payload.status === 'hold' ? (payload.holdExpires || null) : null,
        notes: (payload.notes || '').trim(),
        createdAt: now,
        createdBy: user.username,
        updatedAt: now,
        updatedBy: user.username,
        lockedAt: payload.status === 'locked' ? now : null,
        lockedBy: payload.status === 'locked' ? user.username : null
      };

      await kv.set(bookingKey(booking.id), booking);
      const index = await getIndex();
      index.push(booking.id);
      await setIndex(index);

      return res.status(201).json({ ok: true, booking });
    }

    if (req.method === 'PUT') {
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: 'id_required' });

      const existing = await kv.get(bookingKey(id));
      if (!existing) return res.status(404).json({ ok: false, error: 'booking_not_found' });

      // Build merged candidate, then validate
      const merged = { ...existing, ...updates };
      const errors = validateBookingPayload(merged);
      if (errors.length) return res.status(400).json({ ok: false, errors });

      const now = new Date().toISOString();
      merged.updatedAt = now;
      merged.updatedBy = user.username;

      // If status transitions to 'locked' and wasn't before, stamp it
      if (merged.status === 'locked' && existing.status !== 'locked') {
        merged.lockedAt = now;
        merged.lockedBy = user.username;
      }
      // If reverted to hold, clear lock
      if (merged.status === 'hold' && existing.status === 'locked') {
        merged.lockedAt = null;
        merged.lockedBy = null;
      }

      await kv.set(bookingKey(id), merged);
      return res.status(200).json({ ok: true, booking: merged });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: 'id_required' });

      const existing = await kv.get(bookingKey(id));
      if (!existing) return res.status(404).json({ ok: false, error: 'booking_not_found' });

      await kv.del(bookingKey(id));
      const index = await getIndex();
      await setIndex(index.filter(x => x !== id));

      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (err) {
    console.error('Bookings API error:', err);
    return res.status(500).json({ ok: false, error: 'server_error', detail: String(err.message || err) });
  }
}
