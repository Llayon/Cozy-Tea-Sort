/**
 * Telegram WebApp Integration and Haptic Feedback
 */

class TelegramManager {
  private hasInitialized = false;

  init() {
    if (this.hasInitialized) return;
    this.hasInitialized = true;

    try {
      const webapp = window.Telegram?.WebApp;
      if (webapp) {
        webapp.ready();
        webapp.expand();
        if ('headerColor' in webapp) {
          webapp.headerColor = '#1A1412';
        }
        if ('backgroundColor' in webapp) {
          webapp.backgroundColor = '#1A1412';
        }
      }
    } catch {
      // ignore
    }
  }

  get isInsideTelegram(): boolean {
    return Boolean(window.Telegram?.WebApp?.HapticFeedback);
  }

  /**
   * Cup selection haptic feedback
   */
  hapticSelection() {
    try {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (haptic?.selectionChanged) {
        haptic.selectionChanged();
      } else if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Successful pour haptic feedback (impact 'medium')
   */
  hapticPour() {
    try {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (haptic?.impactOccurred) {
        haptic.impactOccurred('medium');
      } else if (navigator.vibrate) {
        navigator.vibrate([15, 30, 20]);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Invalid move haptic feedback (notification 'error')
   */
  hapticError() {
    try {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (haptic?.notificationOccurred) {
        haptic.notificationOccurred('error');
      } else if (navigator.vibrate) {
        navigator.vibrate([40, 20, 40]);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Puzzle solved haptic feedback (notification 'success')
   */
  hapticSuccess() {
    try {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (haptic?.notificationOccurred) {
        haptic.notificationOccurred('success');
      } else if (navigator.vibrate) {
        navigator.vibrate([20, 50, 20, 50, 40]);
      }
    } catch {
      // ignore
    }
  }
}

export const telegram = new TelegramManager();
