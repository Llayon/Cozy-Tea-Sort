/**
 * Authoritative Telegram integration (moved from the monolith).
 * Best-effort haptics: failure never breaks gameplay, fallback
 * vibration is guarded, init is idempotent, no double-fire here
 * (input handlers own their single call sites).
 */

export class TelegramManager {
  private hasInitialized = false;

  init() {
    if (this.hasInitialized) return;
    this.hasInitialized = true;
    try {
      const webapp = window.Telegram?.WebApp;
      if (webapp) {
        webapp.ready();
        webapp.expand();
        if (typeof (webapp as unknown as { disableVerticalSwipes?: () => void }).disableVerticalSwipes === 'function') {
          (webapp as unknown as { disableVerticalSwipes: () => void }).disableVerticalSwipes();
        }
        if ('headerColor' in webapp) webapp.headerColor = '#1A1412';
        if ('backgroundColor' in webapp) webapp.backgroundColor = '#1A1412';
      }
    } catch {
      // fallback safe
    }
  }

  get isInsideTelegram(): boolean {
    try {
      return Boolean(window.Telegram?.WebApp?.HapticFeedback);
    } catch {
      return false;
    }
  }

  hapticSelection() {
    try {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (haptic?.selectionChanged) {
        haptic.selectionChanged();
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
    } catch {
      // ignore
    }
  }

  hapticPour() {
    try {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (haptic?.impactOccurred) {
        haptic.impactOccurred('medium');
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate([15, 25, 15]);
      }
    } catch {
      // ignore
    }
  }

  hapticError() {
    try {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (haptic?.notificationOccurred) {
        haptic.notificationOccurred('error');
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate([35, 20, 35]);
      }
    } catch {
      // ignore
    }
  }

  hapticSuccess() {
    try {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (haptic?.notificationOccurred) {
        haptic.notificationOccurred('success');
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate([20, 40, 20, 40, 30]);
      }
    } catch {
      // ignore
    }
  }
}

export const telegram = new TelegramManager();
