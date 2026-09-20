/**
 * Recipient Resolution Service for NER-Sahayak
 * Resolves active phone numbers from Supabase profiles (with SQLite fallback)
 * for Drivers, Logistics Operators, Field Officers, and Affected Corridor Drivers.
 */

const { getSupabaseClient } = require('../config/supabase');
const db = require('../db');
const { normalizeIndianPhone } = require('./smsService');

/**
 * Normalizes user record with validated phone
 */
function formatRecipient(user) {
  if (!user || !user.phone) return null;
  const normalizedPhone = normalizeIndianPhone(user.phone);
  if (!normalizedPhone) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    normalizedPhone,
    state: user.state || null,
    district: user.district || null,
    organisation: user.organisation || null,
  };
}

/**
 * Get all logistics operators with valid phone numbers
 */
async function getLogisticsOperatorRecipients() {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, phone, role, state, district, organisation')
        .eq('role', 'logistics')
        .not('phone', 'is', null);

      if (!error && Array.isArray(data)) {
        return data.map(formatRecipient).filter(Boolean);
      }
    } catch (err) {
      console.warn('[RecipientService] Supabase logistics query failed, falling back to SQLite:', err.message);
    }
  }

  // SQLite fallback
  try {
    const rows = db.prepare("SELECT id, name, email, phone, role, state, district, organisation FROM users WHERE role = 'logistics' AND phone IS NOT NULL").all();
    return rows.map(formatRecipient).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Get field officers with valid phone numbers, optionally filtered by state or district
 */
async function getFieldOfficerRecipients(filter = {}) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      let query = supabase
        .from('profiles')
        .select('id, name, email, phone, role, state, district, organisation')
        .eq('role', 'field')
        .not('phone', 'is', null);

      if (filter.state) query = query.ilike('state', `%${filter.state}%`);
      if (filter.district) query = query.ilike('district', `%${filter.district}%`);

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.map(formatRecipient).filter(Boolean);
      }
    } catch (err) {
      console.warn('[RecipientService] Supabase field query failed, falling back to SQLite:', err.message);
    }
  }

  // SQLite fallback
  try {
    let sql = "SELECT id, name, email, phone, role, state, district, organisation FROM users WHERE role = 'field' AND phone IS NOT NULL";
    const params = [];
    if (filter.state) {
      sql += ' AND state LIKE ?';
      params.push(`%${filter.state}%`);
    }
    if (filter.district) {
      sql += ' AND district LIKE ?';
      params.push(`%${filter.district}%`);
    }
    const rows = db.prepare(sql).all(...params);
    return rows.map(formatRecipient).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Get registered drivers, filtering out inactive/offline drivers when activeOnly is true
 */
async function getDriverRecipients(options = { activeOnly: true }) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (options.activeOnly) {
        // Query profiles joining drivers table with status active/available
        const { data, error } = await supabase
          .from('drivers')
          .select(`
            status,
            profiles:user_id (
              id, name, email, phone, role, state, district, organisation
            )
          `)
          .in('status', ['available', 'active']);

        if (!error && Array.isArray(data) && data.length > 0) {
          const list = data.map((d) => formatRecipient(d.profiles)).filter(Boolean);
          if (list.length > 0) return list;
        }
      }

      // Fallback to all drivers in profiles if drivers table is empty or activeOnly is false
      const { data: pData, error: pErr } = await supabase
        .from('profiles')
        .select('id, name, email, phone, role, state, district, organisation')
        .eq('role', 'driver')
        .not('phone', 'is', null);

      if (!pErr && Array.isArray(pData)) {
        return pData.map(formatRecipient).filter(Boolean);
      }
    } catch (err) {
      console.warn('[RecipientService] Supabase driver query failed, falling back to SQLite:', err.message);
    }
  }

  // SQLite fallback
  try {
    const rows = db.prepare("SELECT id, name, email, phone, role, state, district, organisation FROM users WHERE role = 'driver' AND phone IS NOT NULL").all();
    return rows.map(formatRecipient).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Get government / DoNER officials with valid phone numbers
 */
async function getOfficialRecipients(filter = {}) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      let query = supabase
        .from('profiles')
        .select('id, name, email, phone, role, state, district, organisation, department')
        .eq('role', 'official')
        .not('phone', 'is', null);

      if (filter.department) query = query.ilike('department', `%${filter.department}%`);
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.map(formatRecipient).filter(Boolean);
      }
    } catch (err) {
      console.warn('[RecipientService] Supabase official query failed, falling back to SQLite:', err.message);
    }
  }

  // SQLite fallback
  try {
    let sql = "SELECT id, name, email, phone, role, state, district, organisation FROM users WHERE role = 'official' AND phone IS NOT NULL";
    const rows = db.prepare(sql).all();
    return rows.map(formatRecipient).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Find drivers affected by an incident on a corridor, road, or node
 * Evaluates active vehicles and shipments along the corridor.
 *
 * @param {Object} incident - { nodeId, road, fromNode, toNode, ... }
 * @returns {Promise<Array<Object>>} List of affected drivers
 */
async function getAffectedDriverRecipients(incident = {}) {
  const targetRoad = (incident.road || '').toLowerCase().trim();
  const targetNodes = [
    incident.nodeId,
    incident.fromNode,
    incident.toNode,
  ].filter(Boolean).map((n) => String(n).toLowerCase().trim());

  if (!targetRoad && targetNodes.length === 0) {
    return [];
  }

  const driverRecipients = await getDriverRecipients({ activeOnly: true });
  if (driverRecipients.length === 0) return [];

  const supabase = getSupabaseClient();
  const affectedDriverIds = new Set();

  if (supabase) {
    try {
      // 1. Check active shipments
      const { data: shipments } = await supabase
        .from('shipments')
        .select('driver_id, origin_node, destination_node, status')
        .in('status', ['planned', 'in_transit', 'assigned']);

      if (Array.isArray(shipments)) {
        for (const s of shipments) {
          if (!s.driver_id) continue;
          const orig = String(s.origin_node || '').toLowerCase();
          const dest = String(s.destination_node || '').toLowerCase();
          if (targetNodes.includes(orig) || targetNodes.includes(dest)) {
            affectedDriverIds.add(s.driver_id);
          }
        }
      }

      // 2. Check active vehicles
      const { data: vehicles } = await supabase
        .from('vehicles')
        .select('owner_id, origin_node, destination_node, status')
        .in('status', ['in_transit', 'en_route']);

      if (Array.isArray(vehicles)) {
        for (const v of vehicles) {
          if (!v.owner_id) continue;
          const orig = String(v.origin_node || '').toLowerCase();
          const dest = String(v.destination_node || '').toLowerCase();
          if (targetNodes.includes(orig) || targetNodes.includes(dest)) {
            affectedDriverIds.add(v.owner_id);
          }
        }
      }
    } catch (err) {
      console.warn('[RecipientService] Failed checking active corridor vehicles/shipments in Supabase:', err.message);
    }
  }

  // SQLite check for active corridor vehicles/shipments
  try {
    const vRows = db.prepare("SELECT ownerId, originNode, destinationNode FROM vehicles WHERE status IN ('in_transit', 'en_route')").all();
    for (const v of vRows) {
      const orig = String(v.originNode || '').toLowerCase();
      const dest = String(v.destinationNode || '').toLowerCase();
      if (targetNodes.includes(orig) || targetNodes.includes(dest)) {
        affectedDriverIds.add(v.ownerId);
      }
    }
  } catch (_) {}

  // If specific corridor matches were identified, filter to those drivers
  if (affectedDriverIds.size > 0) {
    const matched = driverRecipients.filter((d) => affectedDriverIds.has(d.id));
    if (matched.length > 0) return matched;
  }

  // If no shipment or vehicle is explicitly tagged, match drivers whose registered district or state aligns with incident location
  if (incident.district || incident.state) {
    const distMatch = driverRecipients.filter((d) => {
      const stateMatch = incident.state && d.state && d.state.toLowerCase() === incident.state.toLowerCase();
      const distMatch = incident.district && d.district && d.district.toLowerCase() === incident.district.toLowerCase();
      return distMatch || stateMatch;
    });
    if (distMatch.length > 0) return distMatch;
  }

  // Default to returning active drivers if corridor alert is broadcast
  return driverRecipients.slice(0, 5);
}

module.exports = {
  formatRecipient,
  getLogisticsOperatorRecipients,
  getFieldOfficerRecipients,
  getDriverRecipients,
  getOfficialRecipients,
  getAffectedDriverRecipients,
};
