import { useEffect, useRef } from 'react';

// TradingView's embed widgets are self-executing third-party scripts, not a
// React-friendly API — there's no prop-driven way to re-init one in place,
// so this builds the exact DOM structure TradingView's own embed snippets
// use (a widget div + a sibling <script> whose text content is the JSON
// config) imperatively, and rebuilds it whenever scriptSrc/config change
// (e.g. the color theme toggling).
export function TradingViewWidget({
  scriptSrc,
  config,
  height = 550,
}: {
  scriptSrc: string;
  config: object;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const configJson = JSON.stringify(config);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    const script = document.createElement('script');
    script.src = scriptSrc;
    script.async = true;
    script.textContent = configJson;
    container.appendChild(widgetDiv);
    container.appendChild(script);
    return () => {
      container.innerHTML = '';
    };
  }, [scriptSrc, configJson]);

  return <div className="tradingview-widget-container" ref={containerRef} style={{ height }} />;
}
