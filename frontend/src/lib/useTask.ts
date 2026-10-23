import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { TaskInfo } from '../types';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

/**
 * Poll a backend task until it reaches a terminal state.
 * Returns the latest snapshot, or null before the first poll lands.
 */
export function useTask(taskId: string | null, onTerminal?: (task: TaskInfo) => void): TaskInfo | null {
  const [task, setTask] = useState<TaskInfo | null>(null);
  const terminalRef = useRef(onTerminal);
  terminalRef.current = onTerminal;

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }
    let stopped = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const info = await api.tasks.get(taskId);
        if (stopped) return;
        setTask(info);
        if (TERMINAL.has(info.status)) {
          terminalRef.current?.(info);
          return;
        }
        timer = window.setTimeout(poll, 1200);
      } catch {
        if (!stopped) timer = window.setTimeout(poll, 2500);
      }
    };

    poll();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [taskId]);

  return task;
}
