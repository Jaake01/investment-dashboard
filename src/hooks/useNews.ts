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
  const [trendingPage, setTrendingPage] = useState(1);
  const [holdingsPage, setHoldingsPage] = useState(1);
  const [trendingHasMore, setTrendingHasMore] = useState(false);
  const [holdingsHasMore, setHoldingsHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const holdingSymbols = () => Array.from(new Set(holdings.map((h) => h.symbol.trim()).filter(Boolean)));

  const refresh = async () => {
    const apiKey = settings.marketauxApiKey.trim();
    if (!apiKey) {
      setError('請先在設定中填入 Marketaux API key');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const [trending, holdingsResult] = await Promise.all([
        fetchTrendingNews(apiKey, 1),
        fetchHoldingsNews(apiKey, holdingSymbols(), 1),
      ]);
      setTrendingNews(trending.items);
      setTrendingHasMore(trending.hasMore);
      setTrendingPage(1);
      setHoldingsNews(holdingsResult.items);
      setHoldingsHasMore(holdingsResult.hasMore);
      setHoldingsPage(1);
    } catch (err) {
      setError(err instanceof NewsFetchError ? err.message : '新聞讀取失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreTrending = async () => {
    const apiKey = settings.marketauxApiKey.trim();
    if (!apiKey) return;
    setIsLoadingMore(true);
    setError('');
    try {
      const nextPage = trendingPage + 1;
      const result = await fetchTrendingNews(apiKey, nextPage);
      setTrendingNews((prev) => [...prev, ...result.items]);
      setTrendingHasMore(result.hasMore);
      setTrendingPage(nextPage);
    } catch (err) {
      setError(err instanceof NewsFetchError ? err.message : '新聞讀取失敗');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const loadMoreHoldings = async () => {
    const apiKey = settings.marketauxApiKey.trim();
    if (!apiKey) return;
    setIsLoadingMore(true);
    setError('');
    try {
      const nextPage = holdingsPage + 1;
      const result = await fetchHoldingsNews(apiKey, holdingSymbols(), nextPage);
      setHoldingsNews((prev) => [...prev, ...result.items]);
      setHoldingsHasMore(result.hasMore);
      setHoldingsPage(nextPage);
    } catch (err) {
      setError(err instanceof NewsFetchError ? err.message : '新聞讀取失敗');
    } finally {
      setIsLoadingMore(false);
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

  return {
    trendingNews,
    holdingsNews,
    trendingHasMore,
    holdingsHasMore,
    isLoading,
    isLoadingMore,
    error,
    refresh,
    loadMoreTrending,
    loadMoreHoldings,
  };
}
