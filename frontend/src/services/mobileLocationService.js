import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * Mobile Location & Haptics Service for NER-LINK
 * Provides high-accuracy GPS access across Native iOS/Android (Capacitor) and Browser environments.
 */

export const isNativeMobile = () => {
  return typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform();
};

export const triggerHapticFeedback = async (style = ImpactStyle.Medium) => {
  try {
    if (isNativeMobile()) {
      await Haptics.impact({ style });
    }
  } catch (err) {
    // Graceful fallback for web
  }
};

export const getCurrentPosition = async () => {
  try {
    if (isNativeMobile()) {
      // Native Capacitor High Accuracy GPS
      const permissions = await Geolocation.checkPermissions();
      if (permissions.location !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location !== 'granted') {
          throw new Error('Location permission denied on mobile device');
        }
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 3000
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed
      };
    } else {
      // Standard Browser Geolocation API
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation is not supported by your browser'));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed
          }),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    }
  } catch (err) {
    console.warn('[MobileLocationService] Failed to retrieve exact location:', err.message);
    throw err;
  }
};
