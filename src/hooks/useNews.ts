import { useEffect, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { fetchHoldingsNews, fetchTrendingNews, NewsFetchError } from '../lib/newsProvider';
import type { NewsItem } from '../types';

// Unlike usePrices/useAutoSync, this isn't mounted at the Layout level —
// news doesn't feed into snapshots or need to run while other tabs are
// open, so it only fetches when NewsPanel itself is mounted (i.e. the 新聞
// tab is visited).
export function useNews() {
  const { settings, holdings } = usePortfolio();
  const [trendingNews, setTrendingNews] = useState<NewsItem[]>([]);
  const [holdingsNews, setHoldingsNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    const apiKey = settings.marketauxApiKey.trim();
    if (!apiKey) {
      setError('請先在設定中填入 Marketaux API key');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const symbols = Array.from(new Set(holdings.map((h) => h.symbol.trim()).filter(Boolean)));
      const [trending, holdingsResult] = await Promise.all([
        fetchTrendingNews(apiKey),
        fetchHoldingsNews(apiKey, symbols),
      ]);
      setTrendingNews(trending);
      setHoldingsNews(holdingsResult);
    } catch (err) {
      setError(err instanceof NewsFetchError ? err.message : '新聞讀取失敗');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (settings.marketauxApiKey.trim()) {
      refresh();
    }
    // Deliberately mount-only — re-fetching every time `holdings` changes
    // would burn through the free-tier daily quota as holdings are edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { trendingNews, holdingsNews, isLoading, error, refresh };
}
