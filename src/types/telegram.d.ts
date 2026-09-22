/**
 * Telegram WebApp global interface definitions
 */

export interface TelegramHapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
}

export interface TelegramWebApp {
  ready(): void;
  expand(): void;
  close(): void;
  HapticFeedback?: TelegramHapticFeedback;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  themeParams?: Record<string, string>;
  headerColor?: string;
  backgroundColor?: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}
