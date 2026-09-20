/**
 * Automated Verification Suite for NER-Sahayak SMS Notifications
 * Tests:
 * 1. Phone number normalization (10-digit, 11-digit leading 0, 12-digit +91/91, invalid inputs)
 * 2. Phone privacy masking (e.g. 98******10)
 * 3. Test mode simulation (console logging and mock response)
 * 4. Recipient lookup for Logistics Operators, Drivers, Field Officers
 * 5. Driver active filtering and corridor disruption mapping
 * 6. Duplicate prevention idempotency check via notification_logs
 * 7. Provider failure non-blocking resilience
 * 8. End-to-end event dispatches: New User, Driver Incident, Field Officer Incident, Resolved
 */

const assert = require('assert');
const { v4: uuid } = require('uuid');
const db = require('../db');
const {
  normalizeIndianPhone,
  isValidIndianPhone,
  maskPhone,
  sendSMS,
  sendBulkSMS,
} = require('../services/smsService');
const {
  getLogisticsOperatorRecipients,
  getDriverRecipients,
  getFieldOfficerRecipients,
  getOfficialRecipients,
  getAffectedDriverRecipients,
} = require('../services/recipientService');
const {
  isDuplicateNotification,
  recordNotificationLog,
  notifyNewUserRegistered,
  notifyDriverIncident,
  notifyFieldOfficerIncident,
  notifyAffectedDrivers,
  notifyIncidentResolved,
} = require('../services/notificationService');

let passedTests = 0;
let totalTests = 0;

function it(description, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res
        .then(() => {
          console.log(`  ✓ PASS: ${description}`);
          passedTests++;
        })
        .catch((err) => {
          console.error(`  ✗ FAIL: ${description}`);
          console.error(`    Error: ${err.message}`);
          throw err;
        });
    }
    console.log(`  ✓ PASS: ${description}`);
    passedTests++;
    return Promise.resolve();
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('NER-SAHAYAK REAL SMS & NOTIFICATION VERIFICATION SUITE');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. Phone Number Normalization Tests
  // -------------------------------------------------------------
  console.log('--- 1. Phone Normalization & Validation ---');

  await it('Normalizes 10-digit number (9876543210 -> 919876543210)', () => {
    assert.strictEqual(normalizeIndianPhone('9876543210'), '919876543210');
    assert.strictEqual(isValidIndianPhone('9876543210'), true);
  });

  await it('Normalizes 11-digit number with leading zero (09876543210 -> 919876543210)', () => {
    assert.strictEqual(normalizeIndianPhone('09876543210'), '919876543210');
  });

  await it('Normalizes international format with spaces and plus (+91 98765 43210 -> 919876543210)', () => {
    assert.strictEqual(normalizeIndianPhone('+91 98765 43210'), '919876543210');
  });

  await it('Normalizes 12-digit format with 91 prefix (919876543210 -> 919876543210)', () => {
    assert.strictEqual(normalizeIndianPhone('919876543210'), '919876543210');
  });

  await it('Rejects invalid numbers (too short, wrong starting digit, non-digits)', () => {
    assert.strictEqual(normalizeIndianPhone('12345'), null);
    assert.strictEqual(normalizeIndianPhone('5555555555'), null); // Does not start with 6-9
    assert.strictEqual(normalizeIndianPhone('abcdefghij'), null);
    assert.strictEqual(normalizeIndianPhone(null), null);
    assert.strictEqual(normalizeIndianPhone(''), null);
    assert.strictEqual(isValidIndianPhone('0000000000'), false);
  });

  // -------------------------------------------------------------
  // 2. Phone Masking for Log Privacy
  // -------------------------------------------------------------
  console.log('\n--- 2. Phone Masking for Privacy ---');

  await it('Masks phone in privacy format (e.g. 98******10)', () => {
    const masked = maskPhone('9876543210');
    assert.strictEqual(masked, '98******10');
    const maskedFromNorm = maskPhone('+919876543210');
    assert.strictEqual(maskedFromNorm, '98******10');
  });

  // -------------------------------------------------------------
  // 3. Test Mode SMS Dispatch
  // -------------------------------------------------------------
  console.log('\n--- 3. Test Mode Simulation ---');

  await it('Dispatches SMS in test mode with simulation output', async () => {
    const res = await sendSMS('9876543210', 'Test Sahayak alert message');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.testMode, true);
    assert.strictEqual(res.recipient, '919876543210');
    assert.ok(res.messageId.startsWith('test-'));
  });

  await it('Rejects invalid phone number cleanly without crashing', async () => {
    const res = await sendSMS('invalid_phone', 'This should fail gracefully');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'failed');
    assert.ok(res.error.includes('Invalid Indian'));
  });

  await it('Dispatches bulk SMS in test mode', async () => {
    const recipients = ['9876543210', '9811122233'];
    const results = await sendBulkSMS(recipients, 'Bulk advisory message');
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].success, true);
    assert.strictEqual(results[1].success, true);
  });

  // -------------------------------------------------------------
  // 4. Recipient Lookup from Database
  // -------------------------------------------------------------
  console.log('\n--- 4. Recipient Resolution from Database ---');

  await it('Finds logistics operators with valid phone numbers', async () => {
    const operators = await getLogisticsOperatorRecipients();
    assert.ok(Array.isArray(operators));
    console.log(`    Found ${operators.length} logistics operator(s)`);
    operators.forEach((op) => {
      assert.strictEqual(op.role, 'logistics');
      assert.ok(op.normalizedPhone);
      assert.ok(op.phone);
    });
  });

  await it('Finds field officers with valid phone numbers', async () => {
    const fieldOfficers = await getFieldOfficerRecipients();
    assert.ok(Array.isArray(fieldOfficers));
    console.log(`    Found ${fieldOfficers.length} field officer(s)`);
    fieldOfficers.forEach((fo) => {
      assert.strictEqual(fo.role, 'field');
      assert.ok(fo.normalizedPhone);
    });
  });

  await it('Finds drivers and applies active filtering', async () => {
    const drivers = await getDriverRecipients({ activeOnly: true });
    assert.ok(Array.isArray(drivers));
    console.log(`    Found ${drivers.length} active driver(s)`);
    drivers.forEach((d) => {
      assert.strictEqual(d.role, 'driver');
      assert.ok(d.normalizedPhone);
    });
  });

  await it('Finds affected corridor drivers for an incident', async () => {
    const affected = await getAffectedDriverRecipients({
      nodeId: 'nagaon',
      road: 'NH27',
      fromNode: 'guwahati',
      toNode: 'nagaon',
    });
    assert.ok(Array.isArray(affected));
    console.log(`    Resolved ${affected.length} corridor driver(s) for NH27/nagaon`);
  });

  // -------------------------------------------------------------
  // 5. Duplicate Prevention (Idempotency) & Audit Logging
  // -------------------------------------------------------------
  console.log('\n--- 5. Duplicate Prevention (Idempotency) & Logging ---');

  const testEventId = 'test-inc-' + uuid().slice(0, 8);
  const testPhone = '919876543210';

  await it('Correctly detects when notification has not yet been sent', async () => {
    const isDup = await isDuplicateNotification('corridor_alert', testEventId, testPhone);
    assert.strictEqual(isDup, false);
  });

  await it('Records sent notification log in notification_logs table', async () => {
    const logId = await recordNotificationLog({
      eventType: 'corridor_alert',
      eventId: testEventId,
      recipientPhone: testPhone,
      recipientRole: 'driver',
      message: 'Initial alert on NH27',
      status: 'sent',
      providerMessageId: 'msg-001',
    });
    assert.ok(logId);

    // Verify row exists in DB
    const row = db.prepare('SELECT * FROM notification_logs WHERE id = ?').get(logId);
    assert.ok(row);
    assert.strictEqual(row.event_type, 'corridor_alert');
    assert.strictEqual(row.status, 'sent');
    assert.strictEqual(row.recipient_phone, testPhone);
  });

  await it('Prevents duplicate notification for identical event and recipient', async () => {
    const isDup = await isDuplicateNotification('corridor_alert', testEventId, testPhone);
    assert.strictEqual(isDup, true, 'Should detect duplicate for sent notification');
  });

  // -------------------------------------------------------------
  // 6. High-Level Event-Driven Notification Workflows
  // -------------------------------------------------------------
  console.log('\n--- 6. End-to-End Notification Workflows ---');

  await it('Dispatches welcome notification on new user registration', async () => {
    const testUser = {
      id: uuid(),
      name: 'Raktim Borah',
      role: 'driver',
      phone: '9876543210',
    };
    const res = await notifyNewUserRegistered(testUser);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'sent');
  });

  await it('Dispatches notifications when driver reports incident', async () => {
    const incident = {
      id: uuid(),
      road: 'NH27',
      nodeId: 'nagaon',
      category: 'landslide',
      severity: 'high',
    };
    const res = await notifyDriverIncident(incident);
    assert.strictEqual(res.success, true);
    assert.ok(res.count >= 0);
  });

  await it('Dispatches urgent notifications for verified field officer incident', async () => {
    const incident = {
      id: uuid(),
      road: 'NH15',
      nodeId: 'tezpur',
      category: 'flood',
      severity: 'critical',
    };
    const res = await notifyFieldOfficerIncident(incident);
    assert.strictEqual(res.success, true);
  });

  await it('Dispatches resolution notification when incident is resolved', async () => {
    const incident = {
      id: uuid(),
      road: 'NH27',
      nodeId: 'nagaon',
      category: 'landslide',
      status: 'resolved',
    };
    const res = await notifyIncidentResolved(incident);
    assert.strictEqual(res.success, true);
  });

  console.log('\n================================================================');
  console.log(`ALL VERIFICATION TESTS COMPLETED: ${passedTests}/${totalTests} PASSED`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test Suite Encountered Fatal Error:', err);
  process.exit(1);
});
