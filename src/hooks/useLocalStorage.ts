import { useEffect, useState } from 'react';
import { loadFromStorage, saveToStorage } from '../lib/storage';

export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => loadFromStorage(key, initial));

  useEffect(() => {
    saveToStorage(key, value);
  }, [key, value]);

  return [value, setValue];
}
