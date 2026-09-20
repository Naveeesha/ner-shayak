// Offline-first queue for field reports. When a field officer is in a
// low/no-network district, reports are saved locally and flushed to the
// backend once connectivity returns.

const QUEUE_KEY = 'ner_sahayak_offline_reports';

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function writeQueue(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('[OfflineQueue] Storage quota exceeded or write failed:', err.message);
  }
}

export const offlineQueue = {
  add(report) {
    const items = readQueue();
    const id = report.id || `inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clientId = report.clientId || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Do not store duplicate reports
    const existingIdx = items.findIndex((i) => (i.id && i.id === id) || (i.clientId && i.clientId === clientId));
    if (existingIdx >= 0) {
      items[existingIdx] = { ...items[existingIdx], ...report, id, clientId };
    } else {
      items.push({
        ...report,
        id,
        clientId,
        queuedAt: new Date().toISOString(),
      });
    }

    writeQueue(items);
    return items.length;
  },

  count() {
    return readQueue().length;
  },

  all() {
    return readQueue();
  },

  clear() {
    writeQueue([]);
  },

  async flush(api) {
    const items = readQueue();
    if (items.length === 0) return { synced: 0, failed: [] };

    // 1. Process any pending photo uploads first so payloads stay lightweight
    for (const item of items) {
      if (item.photoDataUrl && !item.photoUrl && typeof item.photoDataUrl === 'string' && item.photoDataUrl.startsWith('data:image/')) {
        try {
          const upRes = await api.uploadPhoto(item.id, item.photoDataUrl);
          if (upRes && upRes.success && upRes.photoUrl) {
            item.photoUrl = upRes.photoUrl;
            item.photo_url = upRes.photoUrl;
            delete item.photoDataUrl; // Strip base64 after successful storage upload
          }
        } catch (upErr) {
          console.warn(`[OfflineQueue] Photo upload failed for ${item.id}:`, upErr.message);
        }
      }
    }
    writeQueue(items);

    // 2. Submit reports via batch sync
    try {
      const result = await api.syncReports(items);
      const failedIds = new Set((result.failed || []).map((f) => f.clientId || f.id));
      const remaining = items.filter((i) => failedIds.has(i.clientId) || failedIds.has(i.id));
      writeQueue(remaining);
      return result;
    } catch (err) {
      console.warn('[OfflineQueue] Batch sync failed, attempting single item sync:', err.message);
      // Fallback: sync individually so valid items succeed
      const stillPending = [];
      let syncedCount = 0;
      for (const item of items) {
        try {
          await api.createReport(item);
          syncedCount++;
        } catch (itemErr) {
          stillPending.push(item);
        }
      }
      writeQueue(stillPending);
      return { synced: syncedCount, failed: stillPending };
    }
  },
};

export function isOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

// Auto-sync offline reports whenever connectivity is restored
if (typeof window !== 'undefined') {
  const handleAutoFlush = () => {
    if (offlineQueue.count() > 0) {
      import('./api').then(({ default: api }) => {
        offlineQueue.flush(api).then((res) => {
          if (res.synced > 0) {
            console.log(`[OfflineQueue] Auto-synced ${res.synced} pending reports`);
          }
        }).catch(() => {});
      }).catch(() => {});
    }
  };

  window.addEventListener('online', handleAutoFlush);
  // Also check shortly after initial load
  setTimeout(handleAutoFlush, 3000);
}
