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

interface MarketauxMeta {
  found: number;
  returned: number;
  limit: number;
  page: number;
}

interface MarketauxResponse {
  data?: MarketauxArticle[];
  meta?: MarketauxMeta;
  error?: { message?: string };
}

export interface NewsPage {
  items: NewsItem[];
  hasMore: boolean;
}

const BASE_URL = 'https://api.marketaux.com/v1/news/all';
const PAGE_SIZE = 20;

async function fetchMarketaux(params: Record<string, string>): Promise<NewsPage> {
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
  const items = articles.map((a) => ({
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
  // meta.found is the total match count across all pages; if we haven't
  // reached it yet (or the API omitted meta), there may be more to load.
  const meta = data.meta;
  const hasMore = meta ? meta.page * meta.limit < meta.found : items.length >= PAGE_SIZE;
  return { items, hasMore };
}

// General financial headlines, newest first (`sort=published_desc` —
// Marketaux's default without an explicit sort leans toward relevance, not
// strictly recency).
export async function fetchLatestNews(apiKey: string, page = 1): Promise<NewsPage> {
  return fetchMarketaux({
    api_token: apiKey,
    language: 'en,zh',
    sort: 'published_desc',
    limit: String(PAGE_SIZE),
    page: String(page),
  });
}
