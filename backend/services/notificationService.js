/**
 * Notification Orchestration Service for NER-Sahayak
 * Manages event-driven SMS alerts, duplicate prevention (idempotency),
 * database audit logging (notification_logs), and non-blocking dispatches.
 */

const { v4: uuid } = require('uuid');
const { getSupabaseClient } = require('../config/supabase');
const db = require('../db');
const { sendSMS, normalizeIndianPhone } = require('./smsService');
const {
  getLogisticsOperatorRecipients,
  getFieldOfficerRecipients,
  getAffectedDriverRecipients,
} = require('./recipientService');

/**
 * Check if a notification for the same event and recipient was already sent or queued
 */
async function isDuplicateNotification(eventType, eventId, recipientPhone) {
  if (!eventType || !eventId || !recipientPhone) return false;

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('notification_logs')
        .select('id')
        .eq('event_type', eventType)
        .eq('event_id', String(eventId))
        .eq('recipient_phone', recipientPhone)
        .in('status', ['queued', 'sent'])
        .maybeSingle();

      if (!error && data) return true;
    } catch (_) {}
  }

  // SQLite check
  try {
    const row = db.prepare(`
      SELECT id FROM notification_logs 
      WHERE event_type = ? AND event_id = ? AND recipient_phone = ? AND status IN ('queued', 'sent')
    `).get(eventType, String(eventId), recipientPhone);
    if (row) return true;
  } catch (_) {}

  return false;
}

/**
 * Log notification outcome into notification_logs table
 */
async function recordNotificationLog({
  eventType,
  eventId,
  recipientUserId = null,
  recipientPhone,
  recipientRole = null,
  message,
  provider = 'msg91',
  providerMessageId = null,
  status,
  errorMessage = null,
}) {
  const logId = uuid();
  const now = new Date().toISOString();
  const sentAt = status === 'sent' ? now : null;

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('notification_logs').insert({
        id: logId,
        event_type: eventType,
        event_id: eventId ? String(eventId) : null,
        recipient_user_id: recipientUserId || null,
        recipient_phone: recipientPhone,
        recipient_role: recipientRole,
        message,
        provider,
        provider_message_id: providerMessageId,
        status,
        error_message: errorMessage,
        created_at: now,
        sent_at: sentAt,
      });
      return logId;
    } catch (err) {
      console.warn('[NotificationService] Supabase log insert failed, trying SQLite:', err.message);
    }
  }

  // SQLite fallback
  try {
    const stmt = db.prepare(`
      INSERT INTO notification_logs 
      (id, event_type, event_id, recipient_user_id, recipient_phone, recipient_role, message, provider, provider_message_id, status, error_message, created_at, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      logId,
      eventType,
      eventId ? String(eventId) : null,
      recipientUserId || null,
      recipientPhone,
      recipientRole,
      message,
      provider,
      providerMessageId,
      status,
      errorMessage,
      now,
      sentAt
    );
  } catch (err) {
    console.warn('[NotificationService] SQLite log insert failed:', err.message);
  }

  return logId;
}

/**
 * Send notification to a single recipient with duplicate check and logging
 */
async function dispatchToRecipient({
  recipient,
  message,
  eventType,
  eventId,
}) {
  const phone = recipient.normalizedPhone || normalizeIndianPhone(recipient.phone);
  if (!phone) {
    await recordNotificationLog({
      eventType,
      eventId,
      recipientUserId: recipient.id,
      recipientPhone: recipient.phone || 'UNKNOWN',
      recipientRole: recipient.role,
      message,
      status: 'failed',
      errorMessage: 'Invalid phone number format',
    });
    return { success: false, status: 'failed', error: 'Invalid phone number' };
  }

  // Idempotency check
  const isDup = await isDuplicateNotification(eventType, eventId, phone);
  if (isDup) {
    await recordNotificationLog({
      eventType,
      eventId,
      recipientUserId: recipient.id,
      recipientPhone: phone,
      recipientRole: recipient.role,
      message,
      status: 'skipped',
      errorMessage: 'Duplicate notification suppressed',
    });
    return { success: true, status: 'skipped', reason: 'duplicate' };
  }

  // Dispatch SMS
  const res = await sendSMS(phone, message);

  await recordNotificationLog({
    eventType,
    eventId,
    recipientUserId: recipient.id,
    recipientPhone: phone,
    recipientRole: recipient.role,
    message,
    providerMessageId: res.messageId || null,
    status: res.status === 'sent' ? 'sent' : 'failed',
    errorMessage: res.error || null,
  });

  return res;
}

/**
 * Notify newly registered user
 */
async function notifyNewUserRegistered(user) {
  try {
    if (!user || !user.phone) return { success: false, reason: 'no_phone' };
    const name = user.name || 'User';
    const role = (user.role || 'Member').toUpperCase();
    const message = `Welcome to NER-Sahayak, ${name}! Your account (${role}) has been activated. Access intelligence portal: https://Naveeesha.github.io/ner-shayak/`;

    return await dispatchToRecipient({
      recipient: user,
      message,
      eventType: 'user_registered',
      eventId: user.id || uuid(),
    });
  } catch (err) {
    console.error('[NotificationService] notifyNewUserRegistered error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Notify when a driver reports an incident / roadblock
 * Targets logistics operators and local field officers
 */
async function notifyDriverIncident(incident) {
  try {
    if (!incident) return { success: false };
    const loc = incident.road || incident.nodeId || 'NER Corridor';
    const cat = incident.category ? incident.category.replace('_', ' ') : 'Road Incident';
    const sev = (incident.severity || 'caution').toUpperCase();
    const message = `NER-Sahayak Incident Alert: ${cat} reported on ${loc} (${sev}). Exercise caution. Details in app.`;

    const operators = await getLogisticsOperatorRecipients();
    const fieldOfficers = await getFieldOfficerRecipients({
      state: incident.state,
      district: incident.district,
    });

    const combinedRecipients = [...operators, ...fieldOfficers.slice(0, 3)];
    // Deduplicate by normalized phone
    const seen = new Set();
    const uniqueRecipients = [];
    for (const r of combinedRecipients) {
      const p = r.normalizedPhone || normalizeIndianPhone(r.phone);
      if (p && !seen.has(p)) {
        seen.add(p);
        uniqueRecipients.push(r);
      }
    }

    const results = [];
    for (const rec of uniqueRecipients) {
      const res = await dispatchToRecipient({
        recipient: rec,
        message,
        eventType: 'driver_incident',
        eventId: incident.id || incident._id || uuid(),
      });
      results.push(res);
    }

    return { success: true, count: results.length, results };
  } catch (err) {
    console.error('[NotificationService] notifyDriverIncident error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Notify when a field officer reports or verifies a high/critical hazard
 * Targets logistics operators and corridor drivers
 */
async function notifyFieldOfficerIncident(incident) {
  try {
    if (!incident) return { success: false };
    const loc = incident.road || incident.nodeId || 'NER Corridor';
    const cat = incident.category ? incident.category.replace('_', ' ') : 'Disruption';
    const sev = (incident.severity || 'high').toUpperCase();
    const message = `URGENT ALERT: ${sev} ${cat} verified on ${loc}. Expect disruptions. NER-Sahayak.`;

    const operators = await getLogisticsOperatorRecipients();
    const affectedDrivers = await getAffectedDriverRecipients(incident);

    const combined = [...operators, ...affectedDrivers];
    const seen = new Set();
    const unique = [];
    for (const r of combined) {
      const p = r.normalizedPhone || normalizeIndianPhone(r.phone);
      if (p && !seen.has(p)) {
        seen.add(p);
        unique.push(r);
      }
    }

    const results = [];
    for (const rec of unique) {
      const res = await dispatchToRecipient({
        recipient: rec,
        message,
        eventType: 'field_officer_incident',
        eventId: incident.id || incident._id || uuid(),
      });
      results.push(res);
    }

    return { success: true, count: results.length, results };
  } catch (err) {
    console.error('[NotificationService] notifyFieldOfficerIncident error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Notify drivers specifically affected by a corridor disruption
 */
async function notifyAffectedDrivers(incident) {
  try {
    if (!incident) return { success: false };
    const loc = incident.road || incident.nodeId || 'NER Corridor';
    const cat = incident.category ? incident.category.replace('_', ' ') : 'Hazard';
    const message = `ALERT: Disruption on ${loc} (${cat}). Alternate routes recommended. Check NER-Sahayak.`;

    const drivers = await getAffectedDriverRecipients(incident);
    const results = [];
    for (const d of drivers) {
      const res = await dispatchToRecipient({
        recipient: d,
        message,
        eventType: 'corridor_alert',
        eventId: incident.id || incident._id || uuid(),
      });
      results.push(res);
    }

    return { success: true, count: results.length, results };
  } catch (err) {
    console.error('[NotificationService] notifyAffectedDrivers error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Notify when an incident/disruption has been resolved
 */
async function notifyIncidentResolved(incident) {
  try {
    if (!incident) return { success: false };
    const loc = incident.road || incident.nodeId || 'NER Corridor';
    const cat = incident.category ? incident.category.replace('_', ' ') : 'Route issue';
    const message = `UPDATE: Disruption on ${loc} (${cat}) has been RESOLVED. Normal transit resumed. NER-Sahayak.`;

    const operators = await getLogisticsOperatorRecipients();
    const drivers = await getAffectedDriverRecipients(incident);
    const combined = [...operators, ...drivers];

    const seen = new Set();
    const unique = [];
    for (const r of combined) {
      const p = r.normalizedPhone || normalizeIndianPhone(r.phone);
      if (p && !seen.has(p)) {
        seen.add(p);
        unique.push(r);
      }
    }

    const results = [];
    for (const rec of unique) {
      const res = await dispatchToRecipient({
        recipient: rec,
        message,
        eventType: 'incident_resolved',
        eventId: incident.id || incident._id || uuid(),
      });
      results.push(res);
    }

    return { success: true, count: results.length, results };
  } catch (err) {
    console.error('[NotificationService] notifyIncidentResolved error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  isDuplicateNotification,
  recordNotificationLog,
  dispatchToRecipient,
  notifyNewUserRegistered,
  notifyDriverIncident,
  notifyFieldOfficerIncident,
  notifyAffectedDrivers,
  notifyIncidentResolved,
};
