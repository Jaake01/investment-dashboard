import type { NewsItem } from '../types';

export class NewsFetchError extends Error {}

interface MarketauxEntity {
  symbol?: string;
}

interface MarketauxArticle {
  uuid: string;
  title: string;
  snippet?: string;
  description?: string;
  url: string;
  source: string;
  published_at: string;
  entities?: MarketauxEntity[];
}

interface MarketauxResponse {
  data?: MarketauxArticle[];
  error?: { message?: string };
}

const BASE_URL = 'https://api.marketaux.com/v1/news/all';

async function fetchMarketaux(params: Record<string, string>): Promise<NewsItem[]> {
  const query = new URLSearchParams(params).toString();
  const url = `${BASE_URL}?${query}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new NewsFetchError('無法連線到 Marketaux');
  }
  if (!response.ok) {
    let detail = '';
    try {
      const errJson = (await response.clone().json()) as MarketauxResponse;
      detail = errJson.error?.message ?? '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new NewsFetchError(`Marketaux 回應錯誤（HTTP ${response.status}）${detail ? `：${detail.slice(0, 200)}` : ''}`);
  }
  const data = (await response.json()) as MarketauxResponse;
  if (data.error) {
    throw new NewsFetchError(`Marketaux：${data.error.message ?? '未知錯誤'}`);
  }
  const articles = data.data ?? [];
  return articles.map((a) => ({
    id: a.uuid,
    title: a.title,
    snippet: a.snippet ?? a.description ?? '',
    url: a.url,
    source: a.source,
    publishedAt: a.published_at,
    relatedSymbols: (a.entities ?? [])
      .map((e) => e.symbol)
      .filter((s): s is string => Boolean(s)),
  }));
}

// General financial headlines — Marketaux doesn't expose a true "trending by
// attention" ranking on the free tier, so this is its default relevance/
// recency-sorted feed rather than a literal popularity ranking.
export async function fetchTrendingNews(apiKey: string): Promise<NewsItem[]> {
  return fetchMarketaux({ api_token: apiKey, language: 'en,zh', limit: '20' });
}

export async function fetchHoldingsNews(apiKey: string, symbols: string[]): Promise<NewsItem[]> {
  if (symbols.length === 0) return [];
  return fetchMarketaux({ api_token: apiKey, symbols: symbols.join(','), language: 'en,zh', limit: '20' });
}
