import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, GraduationCap, Newspaper, PlayCircle, RefreshCw, Send, Server, Smartphone } from 'lucide-react';
import {
  AlertKind, AlertPrefs, ContentAlerts, getLiveApiBase, getStoredApiBase, hasNativeBridge,
  loadAlertPrefs, saveAlertPrefs, setStoredApiBase, syncAlertsToNative,
} from '../native/bridge';

const KINDS: Array<{ key: AlertKind; title: string; desc: string; icon: React.ElementType }> = [
  { key: 'articles', title: 'Articles', desc: 'News, explainers and tool spotlights', icon: Newspaper },
  { key: 'videos', title: 'Videos', desc: 'Newly reviewed videos worth your time', icon: PlayCircle },
  { key: 'tutorials', title: 'Tutorials', desc: 'Step-by-step guides for AI tools', icon: GraduationCap },
];

const Switch: React.FC<{ checked: boolean; label: string; disabled?: boolean; onChange: (next: boolean) => void }> = ({ checked, label, disabled, onChange }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
    className={`na-switch ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}>
    <span className="na-switch__track"><span className="na-switch__thumb" /></span>
  </button>
);

export const AlertsPage: React.FC = () => {
  const [prefs, setPrefs] = useState<AlertPrefs>(loadAlertPrefs);
  const [granted, setGranted] = useState<boolean | null>(hasNativeBridge ? null : true);
  const [status, setStatus] = useState<{ lastCheck: number; lastResult: string } | null>(null);
  const [toast, setToast] = useState('');
  const [serverUrl, setServerUrl] = useState(getStoredApiBase() || getLiveApiBase());
  const [serverError, setServerError] = useState('');
  const liveBase = getLiveApiBase();

  const refresh = useCallback(async () => {
    if (!hasNativeBridge) return;
    try { setGranted((await ContentAlerts.permissionStatus()).granted); setStatus(await ContentAlerts.getStatus()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(t); }, [toast]);

  const commit = async (next: AlertPrefs, message: string) => {
    setPrefs(next); saveAlertPrefs(next); await syncAlertsToNative(next); setToast(message);
  };

  const toggleMaster = async (on: boolean) => {
    if (on && hasNativeBridge) {
      const result = await ContentAlerts.askPermission().catch(() => ({ granted: false }));
      setGranted(result.granted);
      if (!result.granted) { setToast('Notifications are blocked for AI Brief. Allow them in system settings.'); return; }
    }
    await commit({ ...prefs, enabled: on }, on ? 'Alerts are on' : 'Alerts are off');
  };

  const sendTest = async () => {
    if (!hasNativeBridge) { setToast('Test alerts are sent from the installed Android app.'); return; }
    const kind = KINDS.find((k) => prefs[k.key])?.key ?? 'articles';
    await ContentAlerts.sendTest({ type: kind }).catch(() => undefined);
    setToast('Test alert sent. Check your notification shade.');
  };

  const checkNow = async () => {
    if (!hasNativeBridge) { setToast('Background checks run in the installed Android app.'); return; }
    await ContentAlerts.checkNow().catch(() => undefined);
    setToast('Checking for new content…');
    window.setTimeout(refresh, 4000);
  };

  const saveServer = (value: string) => {
    const url = value.trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\/[^\s/]+/i.test(url)) { setServerError('Enter a full address that starts with https:// (for example https://example.com/api).'); return; }
    setStoredApiBase(url);
    window.location.reload();
  };

  const blocked = granted === false;
  const lastCheck = status?.lastCheck ? new Date(status.lastCheck).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not yet';

  return (
    <div className="na-page">
      <header className="na-page__head">
        <span className="na-eyebrow"><BellRing size={14} aria-hidden="true" /> Alerts</span>
        <h1 className="font-serif">Know the moment something new lands</h1>
        <p>AI Brief checks for fresh content in the background and sends one clear notification you can tap to open.</p>
      </header>

      {blocked && (
        <div className="na-banner na-banner--warn" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <div><strong>Notifications are blocked</strong><p>Android is not letting AI Brief show alerts yet.</p></div>
          <button type="button" className="na-btn na-btn--small" onClick={() => ContentAlerts.openSystemSettings().catch(() => undefined)}>Open settings</button>
        </div>
      )}
      {!liveBase && (
        <div className="na-banner" role="note">
          <Server size={20} aria-hidden="true" />
          <div><strong>You are viewing demo content</strong><p>Connect your AI Brief server below to receive live alerts. Until then, use the test alert to preview them.</p></div>
        </div>
      )}

      <section className="na-card" aria-labelledby="na-master">
        <div className="na-row na-row--master">
          <span className="na-row__icon na-row__icon--accent" aria-hidden="true"><BellRing size={20} /></span>
          <span className="na-row__text"><strong id="na-master">New content alerts</strong><small>{prefs.enabled ? 'On. Checked about every 15 minutes' : 'Off'}</small></span>
          <Switch checked={prefs.enabled} label="New content alerts" onChange={toggleMaster} />
        </div>
      </section>

      <h2 className="na-section-title">Notify me about</h2>
      <section className={`na-card ${prefs.enabled ? '' : 'is-muted'}`}>
        {KINDS.map(({ key, title, desc, icon: Icon }) => (
          <div className="na-row" key={key}>
            <span className="na-row__icon" aria-hidden="true"><Icon size={20} /></span>
            <span className="na-row__text"><strong>{title}</strong><small>{desc}</small></span>
            <Switch checked={prefs[key]} disabled={!prefs.enabled} label={`${title} alerts`}
              onChange={(on) => commit({ ...prefs, [key]: on }, `${title} alerts ${on ? 'on' : 'off'}`)} />
          </div>
        ))}
      </section>

      <div className="na-actions">
        <button type="button" className="na-btn na-btn--primary" onClick={sendTest}><Send size={18} aria-hidden="true" /> Send a test alert</button>
        <button type="button" className="na-btn na-btn--outline" onClick={checkNow}><RefreshCw size={18} aria-hidden="true" /> Check now</button>
      </div>

      <section className="na-card na-status" aria-label="Alert status">
        <div><CheckCircle2 size={18} aria-hidden="true" /><span>Last check</span><strong>{lastCheck}</strong></div>
        <div><Smartphone size={18} aria-hidden="true" /><span>Result</span><strong>{status?.lastResult || (hasNativeBridge ? 'Waiting for first check' : 'Runs in the Android app')}</strong></div>
        <div><Server size={18} aria-hidden="true" /><span>Source</span><strong>{liveBase || 'Demo content'}</strong></div>
      </section>

      <h2 className="na-section-title">Connection</h2>
      <section className="na-card na-form">
        <label htmlFor="na-server">AI Brief server address</label>
        <input id="na-server" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder="https://your-server.com/api" value={serverUrl} aria-invalid={!!serverError} aria-describedby="na-server-help"
          onChange={(e) => { setServerUrl(e.target.value); setServerError(''); }} />
        <p id="na-server-help" className={serverError ? 'is-error' : ''}>{serverError || 'The app reloads after saving. Leave empty to use the built-in demo content.'}</p>
        <div className="na-actions">
          <button type="button" className="na-btn na-btn--primary" onClick={() => saveServer(serverUrl)}>Save and reload</button>
          {getStoredApiBase() && <button type="button" className="na-btn na-btn--ghost" onClick={() => saveServer('')}>Use demo content</button>}
        </div>
      </section>

      <div className="na-toast" role="status" aria-live="polite">{toast && <span>{toast}</span>}</div>
    </div>
  );
};
