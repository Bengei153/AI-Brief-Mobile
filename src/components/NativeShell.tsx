import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Browser } from '@capacitor/browser';
import { BellRing, RefreshCw, X } from 'lucide-react';
import {
  ContentAlerts, hasNativeBridge, isNativeApp, loadAlertPrefs, saveAlertPrefs,
  syncAlertsToNative, promptWasHandled, markPromptHandled,
} from '../native/bridge';

const PULL_THRESHOLD = 76;
const tap = () => { if (hasNativeBridge) Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined); };
const routeFromUrl = (url?: string | null) => {
  if (!url || !url.startsWith('aibrief://open')) return null;
  const route = url.replace(/^aibrief:\/\/open/, '');
  return route.startsWith('/') ? route : '/';
};

/** Everything that makes the web experience behave like a native Android app. */
export const NativeShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const pathRef = useRef(location.pathname);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  pathRef.current = location.pathname;

  // Shell class, status bar colours, splash, launch deep link.
  useEffect(() => {
    if (!isNativeApp) return;
    const root = document.documentElement;
    root.classList.add('native-app');
    const applyBars = () => {
      if (!hasNativeBridge) return;
      const dark = root.dataset.theme === 'dark';
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
      StatusBar.setBackgroundColor({ color: dark ? '#11100f' : '#faf9f6' }).catch(() => undefined);
    };
    applyBars();
    const observer = new MutationObserver(applyBars);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    if (hasNativeBridge) {
      SplashScreen.hide().catch(() => undefined);
      syncAlertsToNative();
      CapApp.getLaunchUrl().then((launch) => { const r = routeFromUrl(launch?.url); if (r) navigate(r); }).catch(() => undefined);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hardware back, notification taps, in-app browser for outside links, haptics.
  useEffect(() => {
    if (!isNativeApp) return;
    const handles: Array<Promise<{ remove: () => void }>> = [];
    if (hasNativeBridge) {
      handles.push(CapApp.addListener('backButton', () => {
        const drawer = document.querySelector<HTMLElement>('.mobile-drawer-backdrop');
        if (drawer) { drawer.click(); return; }
        if (pathRef.current === '/' || window.history.length <= 1) { CapApp.exitApp(); return; }
        navigate(-1);
      }));
      handles.push(CapApp.addListener('appUrlOpen', ({ url }) => { const r = routeFromUrl(url); if (r) navigate(r); }));
      handles.push(CapApp.addListener('resume', () => { ContentAlerts.checkNow().catch(() => undefined); }));
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.mobile-bottom-nav a, .mobile-bottom-nav button, .na-switch')) tap();
      const anchor = target?.closest<HTMLAnchorElement>('a[href^="http"]');
      if (anchor && hasNativeBridge && anchor.host !== window.location.host) {
        event.preventDefault();
        Browser.open({ url: anchor.href }).catch(() => undefined);
      }
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      handles.forEach((h) => h.then((l) => l.remove()).catch(() => undefined));
    };
  }, [navigate]);

  // Pull to refresh — the gesture people expect on any feed.
  useEffect(() => {
    if (!isNativeApp) return;
    let startY = 0; let active = false; let distance = 0; let busy = false;
    const start = (e: TouchEvent) => {
      active = window.scrollY <= 0 && !busy && !document.querySelector('.mobile-drawer-backdrop');
      startY = e.touches[0].clientY; distance = 0;
    };
    const move = (e: TouchEvent) => {
      if (!active) return;
      distance = Math.max(0, (e.touches[0].clientY - startY) * 0.5);
      if (window.scrollY > 0) { active = false; distance = 0; }
      setPull(Math.min(distance, PULL_THRESHOLD * 1.4));
    };
    const end = async () => {
      if (!active) return;
      active = false;
      if (distance >= PULL_THRESHOLD) {
        busy = true; setRefreshing(true); setPull(PULL_THRESHOLD); tap();
        await Promise.all([queryClient.invalidateQueries(), new Promise((r) => setTimeout(r, 650))]).catch(() => undefined);
        busy = false; setRefreshing(false);
      }
      setPull(0);
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end); window.removeEventListener('touchcancel', end);
    };
  }, [queryClient]);

  // Ask about alerts in context, after the person has seen the app — never on a cold launch.
  useEffect(() => {
    if (!isNativeApp || location.pathname !== '/' || promptWasHandled() || loadAlertPrefs().enabled) { setShowPrompt(false); return; }
    const timer = window.setTimeout(() => setShowPrompt(true), 1800);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  const dismissPrompt = () => { markPromptHandled(); setShowPrompt(false); };
  const acceptPrompt = async () => {
    markPromptHandled(); setShowPrompt(false);
    const result = hasNativeBridge ? await ContentAlerts.askPermission().catch(() => ({ granted: false })) : { granted: true };
    const prefs = { ...loadAlertPrefs(), enabled: result.granted };
    saveAlertPrefs(prefs); await syncAlertsToNative(prefs);
    navigate('/alerts');
  };

  if (!isNativeApp) return null;
  const progress = Math.min(pull / PULL_THRESHOLD, 1);
  return (
    <>
      <div className={`na-ptr ${refreshing ? 'is-refreshing' : ''}`} aria-hidden={!refreshing}
        style={{ transform: `translate(-50%, ${pull - 56}px)`, opacity: pull > 6 ? 1 : 0 }}>
        <RefreshCw size={20} style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }} />
        <span className="na-sr" role="status">{refreshing ? 'Refreshing content' : ''}</span>
      </div>
      {showPrompt && (
        <section className="na-prompt" role="dialog" aria-labelledby="na-prompt-title" aria-describedby="na-prompt-text">
          <button type="button" className="na-prompt__close" aria-label="Dismiss" onClick={dismissPrompt}><X size={20} aria-hidden="true" /></button>
          <span className="na-prompt__icon" aria-hidden="true"><BellRing size={22} /></span>
          <div>
            <h2 id="na-prompt-title" className="font-serif">Never miss a new brief</h2>
            <p id="na-prompt-text">Get a quiet heads-up when new articles, videos and tutorials are published. You choose which ones, and you can switch them off any time.</p>
            <div className="na-prompt__actions">
              <button type="button" className="na-btn na-btn--primary" onClick={acceptPrompt}>Turn on alerts</button>
              <button type="button" className="na-btn na-btn--ghost" onClick={dismissPrompt}>Not now</button>
            </div>
          </div>
        </section>
      )}
    </>
  );
};
