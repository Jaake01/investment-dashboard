import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { loadFromStorage, saveToStorage } from '../lib/storage';

export function useLocalStorage<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => loadFromStorage(key, initial));

  useEffect(() => {
    saveToStorage(key, value);
  }, [key, value]);

  return [value, setValue];
}
