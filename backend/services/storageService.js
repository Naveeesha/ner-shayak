/**
 * Supabase Storage Service for NER-Sahayak
 * Manages incident photo uploads to the `incident-photos` bucket
 * with format validation, size constraints, exact incident ID naming,
 * and safe local fallback.
 */

const path = require('path');
const fs = require('fs');
const { getSupabaseClient } = require('../config/supabase');

const BUCKET_NAME = 'incident-photos';
const ALLOWED_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Validates image MIME type and file size
 *
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {{ valid: boolean, error?: string, extension?: string }}
 */
function validateImage(buffer, mimeType) {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Empty file provided' };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(1);
    return { valid: false, error: `File size (${sizeMb}MB) exceeds the 10MB limit` };
  }

  const normalizedMime = (mimeType || '').toLowerCase().trim();
  const extension = ALLOWED_MIME_TYPES[normalizedMime];
  if (!extension) {
    return {
      valid: false,
      error: 'Invalid file format. Allowed formats: JPG, JPEG, PNG, WEBP',
    };
  }

  return { valid: true, extension };
}

/**
 * Parses Data URL or base64 string into a Buffer and MIME type
 */
function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;

  const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (match) {
    return {
      mimeType: match[1],
      buffer: Buffer.from(match[2], 'base64'),
    };
  }

  // Raw base64 fallback
  try {
    const buffer = Buffer.from(dataUrl, 'base64');
    return { mimeType: 'image/jpeg', buffer };
  } catch (_) {
    return null;
  }
}

/**
 * Ensure `incident-photos` bucket exists in Supabase Storage
 */
async function ensureBucket(supabase) {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = Array.isArray(buckets) && buckets.some((b) => b.name === BUCKET_NAME || b.id === BUCKET_NAME);
    if (!exists) {
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE_BYTES,
        allowedMimeTypes: Object.keys(ALLOWED_MIME_TYPES),
      });
      console.log(`[Storage] Created public bucket '${BUCKET_NAME}'`);
    }
  } catch (err) {
    // Bucket might already exist or service role has direct access
  }
}

/**
 * Upload incident photo to Supabase Storage bucket `incident-photos`
 * File path convention: incidents/${incidentId}.${extension}
 *
 * @param {string} incidentId - The exact ID of the incident
 * @param {Buffer} buffer - File binary data
 * @param {string} mimeType - Image MIME type
 * @returns {Promise<{ success: boolean, photoUrl?: string, photoPath?: string, error?: string }>}
 */
async function uploadIncidentPhoto(incidentIdOrOptions, bufferArg, mimeTypeArg) {
  let incidentId = incidentIdOrOptions;
  let buffer = bufferArg;
  let mimeType = mimeTypeArg;

  // Handle object signature: uploadIncidentPhoto({ incidentId, buffer, mimeType, dataUrl })
  if (typeof incidentIdOrOptions === 'object' && incidentIdOrOptions !== null) {
    incidentId = incidentIdOrOptions.incidentId;
    buffer = incidentIdOrOptions.buffer;
    mimeType = incidentIdOrOptions.mimeType;

    if (!buffer && incidentIdOrOptions.dataUrl) {
      const parsed = parseDataUrl(incidentIdOrOptions.dataUrl);
      if (parsed) {
        buffer = parsed.buffer;
        mimeType = parsed.mimeType;
      }
    }
  }

  const cleanId = String(incidentId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanId) {
    return { success: false, error: 'Valid incident ID is required for photo upload' };
  }

  const validation = validateImage(buffer, mimeType);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const extension = validation.extension;
  const filePath = `incidents/${cleanId}.${extension}`;

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await ensureBucket(supabase);

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (error) {
        console.warn('[Storage] Supabase storage upload error:', error.message);
      } else {
        const { data: pubData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(filePath);

        const photoUrl = pubData?.publicUrl || `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${filePath}`;
        return {
          success: true,
          photoUrl,
          photoPath: filePath,
        };
      }
    } catch (err) {
      console.warn('[Storage] Exception uploading to Supabase Storage:', err.message);
    }
  }

  // Local static file fallback (for development or offline backend operation)
  try {
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'incidents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const localFileName = `${cleanId}.${extension}`;
    const localFullPath = path.join(uploadDir, localFileName);
    fs.writeFileSync(localFullPath, buffer);

    const baseUrl = process.env.PUBLIC_BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`;
    const localUrl = `${baseUrl}/uploads/incidents/${localFileName}`;

    return {
      success: true,
      photoUrl: localUrl,
      photoPath: `uploads/incidents/${localFileName}`,
      isLocalFallback: true,
    };
  } catch (localErr) {
    console.error('[Storage] Local upload fallback failed:', localErr.message);
    return {
      success: false,
      error: `Failed to store incident photo: ${localErr.message}`,
    };
  }
}

/**
 * Helper to upload photo from Data URL string
 */
async function uploadIncidentPhotoFromDataUrl(incidentId, dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return { success: false, error: 'Invalid or malformed photo data' };
  }
  return await uploadIncidentPhoto(incidentId, parsed.buffer, parsed.mimeType);
}

module.exports = {
  BUCKET_NAME,
  ALLOWED_MIME_TYPES,
  validateImage,
  parseDataUrl,
  uploadIncidentPhoto,
  uploadIncidentPhotoFromDataUrl,
};
