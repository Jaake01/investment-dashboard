import { useEffect, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';

// TradingView's embed widgets take a literal "light"/"dark" colorTheme baked
// into their config at script-load time — they don't read CSS custom
// properties or a data-theme attribute the way the rest of this app's
// styling does. This resolves settings.theme's 'system' option down to a
// concrete value by following the OS preference, same signal index.css's
// prefers-color-scheme media query already uses for that case.
export function useEffectiveTheme(): 'light' | 'dark' {
  const { settings } = usePortfolio();
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings.theme]);

  if (settings.theme === 'system') return systemDark ? 'dark' : 'light';
  return settings.theme;
}
