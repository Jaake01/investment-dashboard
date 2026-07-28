import { useEffect, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { fetchLatestNews, NewsFetchError } from '../lib/newsProvider';
import type { NewsItem } from '../types';

// Unlike usePrices/useAutoSync, this isn't mounted at the Layout level —
// news doesn't feed into snapshots or need to run while other tabs are
// open, so it only fetches when NewsPanel itself is mounted (i.e. the 新聞
// tab is visited).
export function useNews() {
  const { settings } = usePortfolio();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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
      const result = await fetchLatestNews(apiKey, 1);
      setNews(result.items);
      setHasMore(result.hasMore);
      setPage(1);
    } catch (err) {
      setError(err instanceof NewsFetchError ? err.message : '新聞讀取失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = async () => {
    const apiKey = settings.marketauxApiKey.trim();
    if (!apiKey) return;
    setIsLoadingMore(true);
    setError('');
    try {
      const nextPage = page + 1;
      const result = await fetchLatestNews(apiKey, nextPage);
      setNews((prev) => [...prev, ...result.items]);
      setHasMore(result.hasMore);
      setPage(nextPage);
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
    // Deliberately mount-only — see refresh() above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { news, hasMore, isLoading, isLoadingMore, error, refresh, loadMore };
}
