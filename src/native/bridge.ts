import { Capacitor, registerPlugin } from '@capacitor/core';
import { VITE_API_BASE_URL } from '../api/client';

export interface AlertPrefs { enabled: boolean; articles: boolean; videos: boolean; tutorials: boolean; }
export type AlertKind = 'articles' | 'videos' | 'tutorials';

interface ContentAlertsPlugin {
  configure(options: AlertPrefs & { baseUrl: string }): Promise<void>;
  permissionStatus(): Promise<{ granted: boolean }>;
  askPermission(): Promise<{ granted: boolean }>;
  checkNow(): Promise<void>;
  sendTest(options: { type: AlertKind }): Promise<void>;
  getStatus(): Promise<{ lastCheck: number; lastResult: string }>;
  openSystemSettings(): Promise<void>;
}

export const ContentAlerts = registerPlugin<ContentAlertsPlugin>('ContentAlerts');

const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } };

export const hasNativeBridge = Capacitor.isNativePlatform();
// `aibrief_force_native` lets the mobile shell be previewed in a desktop browser.
export const isNativeApp = hasNativeBridge || read('aibrief_force_native') === '1';

const PREFS_KEY = 'aibrief_alert_prefs';
const DEFAULT_PREFS: AlertPrefs = { enabled: false, articles: true, videos: true, tutorials: true };

export const loadAlertPrefs = (): AlertPrefs => {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(read(PREFS_KEY) || '{}') }; } catch { return { ...DEFAULT_PREFS }; }
};
export const saveAlertPrefs = (prefs: AlertPrefs) => write(PREFS_KEY, JSON.stringify(prefs));

// Background checks need an absolute server address; demo data has none.
export const getLiveApiBase = (): string => (/^https?:\/\//i.test(VITE_API_BASE_URL) ? VITE_API_BASE_URL.replace(/\/+$/, '') : '');

export const syncAlertsToNative = async (prefs: AlertPrefs = loadAlertPrefs()) => {
  if (!hasNativeBridge) return;
  try { await ContentAlerts.configure({ ...prefs, baseUrl: getLiveApiBase() }); } catch { /* plugin unavailable */ }
};

export const getStoredApiBase = (): string => read('aibrief_api_base_url') || '';
export const setStoredApiBase = (url: string) => {
  try { if (url) localStorage.setItem('aibrief_api_base_url', url); else localStorage.removeItem('aibrief_api_base_url'); } catch { /* ignore */ }
};
export const promptWasHandled = () => read('aibrief_alert_prompt') === '1';
export const markPromptHandled = () => write('aibrief_alert_prompt', '1');
