import { useEffectiveTheme } from '../hooks/useEffectiveTheme';
import { TradingViewWidget } from './TradingViewWidget';

// Popular crypto + US-stock symbols for the Market Overview watchlist — this
// app has no server-side access to the viewer's actual holdings (they live
// in that browser's localStorage), so this is a reasonable default rather
// than something wired to the real portfolio.
const MARKET_OVERVIEW_TABS = [
  {
    title: '加密貨幣',
    symbols: [
      { s: 'BINANCE:BTCUSDT', d: 'Bitcoin' },
      { s: 'BINANCE:ETHUSDT', d: 'Ethereum' },
      { s: 'BINANCE:SOLUSDT', d: 'Solana' },
      { s: 'BINANCE:BNBUSDT', d: 'BNB' },
      { s: 'BINANCE:XRPUSDT', d: 'XRP' },
    ],
  },
  {
    title: '美股',
    symbols: [
      { s: 'NASDAQ:AAPL', d: 'Apple' },
      { s: 'NASDAQ:MSFT', d: 'Microsoft' },
      { s: 'NASDAQ:NVDA', d: 'NVIDIA' },
      { s: 'NASDAQ:TSLA', d: 'Tesla' },
      { s: 'NASDAQ:GOOGL', d: 'Alphabet' },
      { s: 'NASDAQ:AMZN', d: 'Amazon' },
    ],
  },
];

export function TradingView() {
  const colorTheme = useEffectiveTheme();

  return (
    <>
      <section className="card">
        <h2>市場概覽</h2>
        <TradingViewWidget
          scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js"
          config={{
            colorTheme,
            locale: 'zh_TW',
            dateRange: '12M',
            showChart: true,
            isTransparent: false,
            showSymbolLogo: true,
            showFloatingTooltip: false,
            width: '100%',
            height: '100%',
            tabs: MARKET_OVERVIEW_TABS,
          }}
        />
      </section>

      <section className="card">
        <h2>經濟日曆</h2>
        <TradingViewWidget
          scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
          config={{
            colorTheme,
            locale: 'zh_TW',
            isTransparent: false,
            width: '100%',
            height: '100%',
            importanceFilter: '-1,0,1',
          }}
        />
      </section>

      <section className="card">
        <h2>即時新聞</h2>
        {/* TradingView's Top Stories widget only takes one `market` per
            instance — there's no combined "crypto + US stock" feed — so
            this is two widgets side by side rather than one. */}
        <div className="tv-news-grid">
          <div>
            <h3 className="tv-news-heading">加密貨幣新聞</h3>
            <TradingViewWidget
              scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-timeline.js"
              config={{
                colorTheme,
                locale: 'zh_TW',
                isTransparent: false,
                displayMode: 'regular',
                feedMode: 'market',
                market: 'crypto',
                width: '100%',
                height: '100%',
              }}
            />
          </div>
          <div>
            <h3 className="tv-news-heading">美股新聞</h3>
            <TradingViewWidget
              scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-timeline.js"
              config={{
                colorTheme,
                locale: 'zh_TW',
                isTransparent: false,
                displayMode: 'regular',
                feedMode: 'market',
                market: 'stock',
                width: '100%',
                height: '100%',
              }}
            />
          </div>
        </div>
      </section>
    </>
  );
}
