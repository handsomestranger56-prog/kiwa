import { type PropsWithChildren, createContext, use, useEffect, useEffectEvent, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  type PomodoroSettings,
  type TimerState,
  DEFAULT_POMODORO,
  initialTimer,
  interrupt,
  pause,
  reset,
  settle,
  skip,
  start,
} from '@/core/focus/pomodoro';
import { useData } from '@/data/provider';

type Focus = {
  timer: TimerState;
  settings: PomodoroSettings;
  /** Changes every second while the timer runs, so screens can redraw the time left. */
  now: number;
  start: () => void;
  pause: () => void;
  skip: () => void;
  reset: () => void;
  setItem: (itemId: string | null) => void;
  updateSettings: (settings: PomodoroSettings) => void;
};

const FocusContext = createContext<Focus | null>(null);

function parse<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(text) as T) };
  } catch {
    return fallback;
  }
}

/**
 * Holds the Pomodoro timer for the whole app. The timer is saved after every change, so it
 * survives the app being closed. A finished focus phase is logged as a session.
 */
export function FocusProvider({ children }: PropsWithChildren) {
  const data = useData();
  const [timer, setTimer] = useState<TimerState>(initialTimer);
  const [settings, setSettings] = useState<PomodoroSettings>(DEFAULT_POMODORO);
  const [now, setNow] = useState(() => Date.now());
  const loaded = useRef(false);

  // Restore what was saved.
  useEffect(() => {
    let active = true;
    Promise.all([data.settings.get('focus.timer'), data.settings.get('focus.settings')])
      .then(([savedTimer, savedSettings]) => {
        if (!active) return;
        setTimer(parse(savedTimer, initialTimer()));
        setSettings(parse(savedSettings, DEFAULT_POMODORO));
        loaded.current = true;
      })
      .catch(() => {
        loaded.current = true;
      });
    return () => {
      active = false;
    };
  }, [data]);

  const commit = (next: TimerState) => {
    setTimer(next);
    // Saved quietly: the timer changes often and the provider already holds the current value.
    data.settings.setQuietly('focus.timer', JSON.stringify(next)).catch(() => {});
  };

  // Settles the phase when its time is up, logging a finished focus phase.
  const check = useEffectEvent(() => {
    const current = Date.now();
    setNow(current);
    if (!loaded.current) return;
    const result = settle(timer, settings, current);
    if (result.state === timer) return;
    commit(result.state);
    if (result.completed) data.focus.log(result.completed).catch(() => {});
  });

  useEffect(() => {
    const id = setInterval(() => check(), 1000);
    return () => clearInterval(id);
  }, []);

  // Leaving the app during a focus phase counts as an interruption.
  const onAppState = useEffectEvent((state: string) => {
    if (state === 'background' || state === 'inactive') {
      const next = interrupt(timer);
      if (next !== timer) commit(next);
    } else if (state === 'active') {
      check();
    }
  });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => onAppState(state));
    return () => subscription.remove();
  }, []);

  const value: Focus = {
    timer,
    settings,
    now,
    start: () => commit(start(timer, settings, Date.now())),
    pause: () => commit(pause(timer, Date.now())),
    skip: () => commit(skip(timer, settings)),
    reset: () => commit(reset(timer)),
    setItem: (itemId) => commit({ ...timer, itemId }),
    updateSettings: (next) => {
      setSettings(next);
      data.settings.set('focus.settings', JSON.stringify(next)).catch(() => {});
    },
  };

  return <FocusContext value={value}>{children}</FocusContext>;
}

export function useFocus(): Focus {
  const focus = use(FocusContext);
  if (!focus) throw new Error('useFocus must be used inside FocusProvider.');
  return focus;
}
