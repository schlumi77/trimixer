import { useState, useEffect } from 'react';

/** useState that persists its value to localStorage under `key` as JSON. */
export const useLocalStorage = <T,>(key: string, defaultValue: T) => {
  const [value, setValue] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
};
