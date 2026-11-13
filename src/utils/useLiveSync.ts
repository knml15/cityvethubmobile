import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { subscribeDataChanged } from '../api/client';

export interface LiveSyncOptions {
  enabled?: boolean;
  intervalMs?: number;
}

/**
 * Automatic foreground Live Sync hook matching the web dashboard/community sync engine.
 * - Subscribes to `subscribeDataChanged` (250ms debounce) whenever any write operation completes.
 * - Polls silently every `intervalMs` (default 12,000ms) while focused and foregrounded.
 * - Refreshes immediately when the app returns to `'active'` foreground state.
 * - Pauses automatically when the screen loses focus or when `enabled === false` (e.g., modal open).
 */
export function useLiveSync(
  refreshFn: () => void | Promise<void>,
  options?: LiveSyncOptions
) {
  const isFocused = useIsFocused();
  const enabled = options?.enabled !== false;
  const intervalMs = options?.intervalMs ?? 12000;

  const refreshRef = useRef(refreshFn);
  useEffect(() => {
    refreshRef.current = refreshFn;
  }, [refreshFn]);

  useEffect(() => {
    if (!isFocused || !enabled) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let appState: string = AppState.currentState || 'active';

    const triggerRefresh = () => {
      if (AppState.currentState !== 'active') return;
      try {
        Promise.resolve(refreshRef.current()).catch(() => {});
      } catch {
        // Ignore silent sync errors
      }
    };

    const unsubscribeMutation = subscribeDataChanged(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        triggerRefresh();
      }, 250);
    });

    const intervalId = setInterval(() => {
      if (AppState.currentState === 'active') {
        triggerRefresh();
      }
    }, intervalMs);

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (appState !== 'active' && nextState === 'active') {
        triggerRefresh();
      }
      appState = nextState;
    });

    return () => {
      unsubscribeMutation();
      clearInterval(intervalId);
      appStateSub.remove();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [isFocused, enabled, intervalMs]);
}

export default useLiveSync;
