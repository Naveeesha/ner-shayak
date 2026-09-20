/**
 * SMS Notification Service for NER-Sahayak
 * Integrates with MSG91 SMS / Flow API with phone normalization,
 * test mode logging, and error handling.
 */

const fetch = globalThis.fetch || require('node-fetch');

/**
 * Normalizes an Indian phone number into MSG91 standard format: 91XXXXXXXXXX
 * Handles:
 * - 10-digit mobile starting with 6-9: '9876543210' -> '919876543210'
 * - Leading zero: '09876543210' -> '919876543210'
 * - Leading +91 or 91: '+91 98765 43210' -> '919876543210'
 * Returns null if the number is invalid or cannot be normalized.
 */
function normalizeIndianPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;

  // 10 digits starting with 6, 7, 8, 9
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }

  // 11 digits starting with 0 followed by 6, 7, 8, 9
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
    return `91${digits.slice(1)}`;
  }

  // 12 digits starting with 91 followed by 6, 7, 8, 9
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    return digits;
  }

  return null;
}

/**
 * Checks if a phone number is a valid Indian mobile number
 */
function isValidIndianPhone(phone) {
  return normalizeIndianPhone(phone) !== null;
}

/**
 * Masks phone number for privacy in logs:
 * e.g., '919876543210' -> '98******10'
 */
function maskPhone(phone) {
  const norm = normalizeIndianPhone(phone);
  if (!norm) {
    const raw = String(phone || '').trim();
    if (raw.length <= 4) return '****';
    return raw.slice(0, 2) + '******' + raw.slice(-2);
  }
  const tenDigit = norm.slice(2);
  return `${tenDigit.slice(0, 2)}******${tenDigit.slice(-2)}`;
}

/**
 * Get current SMS runtime configuration
 */
function getSMSConfig() {
  const authKey = process.env.MSG91_AUTH_KEY || '';
  const flowId = process.env.MSG91_FLOW_ID || '';
  const senderId = process.env.MSG91_SENDER_ID || 'SAHYAK';
  const isEnabled = String(process.env.MSG91_ENABLED || 'false').toLowerCase() === 'true';
  const isTestMode = String(process.env.SMS_TEST_MODE || 'true').toLowerCase() === 'true' || !isEnabled;

  return {
    authKey,
    flowId,
    senderId,
    isEnabled,
    isTestMode,
  };
}

/**
 * Send an SMS to a single recipient using MSG91 Flow API (or Test Mode)
 *
 * @param {string} to - Recipient phone number
 * @param {string} message - Message text
 * @param {Object} [options] - Additional parameters (variables, flowId, senderId)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string, testMode?: boolean, recipient?: string}>}
 */
async function sendSMS(to, message, options = {}) {
  const normalized = normalizeIndianPhone(to);
  if (!normalized) {
    const masked = maskPhone(to);
    console.warn(`[SMS] Skipped dispatch: Invalid Indian phone number ${masked}`);
    return {
      success: false,
      error: `Invalid Indian mobile number: ${masked}`,
      status: 'failed',
    };
  }

  const config = getSMSConfig();
  const masked = maskPhone(normalized);

  // Test mode or SMS disabled: Log and simulate successful dispatch
  if (config.isTestMode || !config.isEnabled) {
    console.log(`[SMS TEST] recipient: ${masked} message: "${message}"`);
    return {
      success: true,
      testMode: true,
      status: 'sent',
      messageId: `test-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      recipient: normalized,
      phoneMasked: masked,
    };
  }

  // Real MSG91 dispatch
  if (!config.authKey) {
    console.error('[SMS ERROR] MSG91_AUTH_KEY is not configured in real mode');
    return {
      success: false,
      error: 'MSG91_AUTH_KEY is not configured',
      status: 'failed',
    };
  }

  const flowId = options.flowId || config.flowId;
  const senderId = options.senderId || config.senderId;

  try {
    const payload = {
      template_id: flowId,
      sender: senderId,
      short_url: '0',
      recipients: [
        {
          mobiles: normalized,
          message: message,
          ...(options.variables || {}),
        },
      ],
    };

    const response = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        authkey: config.authKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && (data.type === 'success' || !data.type || data.status === 'success')) {
      return {
        success: true,
        status: 'sent',
        messageId: data.message || data.request_id || `msg91-${Date.now()}`,
        recipient: normalized,
      };
    }

    const errDetail = data.message || `HTTP ${response.status} ${response.statusText}`;
    console.error(`[SMS ERROR] MSG91 API error for ${masked}: ${errDetail}`);
    return {
      success: false,
      status: 'failed',
      error: errDetail,
      recipient: normalized,
    };
  } catch (err) {
    console.error(`[SMS ERROR] Network exception sending to ${masked}:`, err.message);
    return {
      success: false,
      status: 'failed',
      error: err.message,
      recipient: normalized,
    };
  }
}

/**
 * Send SMS to multiple recipients
 *
 * @param {Array<string|{phone: string, variables?: Object}>} recipients
 * @param {string} message
 * @param {Object} [options]
 * @returns {Promise<Array<Object>>} Results for each recipient
 */
async function sendBulkSMS(recipients, message, options = {}) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return [];
  }

  const results = [];
  for (const item of recipients) {
    const phone = typeof item === 'string' ? item : item?.phone;
    const itemVars = typeof item === 'object' && item?.variables ? item.variables : {};
    const combinedOptions = {
      ...options,
      variables: { ...(options.variables || {}), ...itemVars },
    };

    const res = await sendSMS(phone, message, combinedOptions);
    results.push(res);
  }

  return results;
}

module.exports = {
  normalizeIndianPhone,
  isValidIndianPhone,
  maskPhone,
  getSMSConfig,
  sendSMS,
  sendBulkSMS,
};
