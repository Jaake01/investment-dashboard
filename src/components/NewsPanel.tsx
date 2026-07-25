import { useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { useNews } from '../hooks/useNews';

type NewsTab = 'trending' | 'holdings';

function formatPublishedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function NewsPanel() {
  const { settings, holdings } = usePortfolio();
  const { trendingNews, holdingsNews, isLoading, error, refresh } = useNews();
  const [tab, setTab] = useState<NewsTab>('trending');

  const hasApiKey = settings.marketauxApiKey.trim().length > 0;
  const items = tab === 'trending' ? trendingNews : holdingsNews;

  return (
    <section className="card">
      <div className="card-header">
        <h2>新聞</h2>
        <button className="btn" onClick={refresh} disabled={isLoading || !hasApiKey}>
          {isLoading ? '讀取中…' : '重新整理'}
        </button>
      </div>

      <div className="tab-bar">
        <button className={`tab-button ${tab === 'trending' ? 'active' : ''}`} onClick={() => setTab('trending')}>
          熱門市場新聞
        </button>
        <button className={`tab-button ${tab === 'holdings' ? 'active' : ''}`} onClick={() => setTab('holdings')}>
          持股相關新聞
        </button>
      </div>

      {!hasApiKey ? (
        <p className="empty-state">請先到設定填入 Marketaux API key。</p>
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : tab === 'holdings' && holdings.length === 0 ? (
        <p className="empty-state">尚未有持股，無法抓取相關新聞。</p>
      ) : items.length === 0 ? (
        <p className="empty-state">{isLoading ? '讀取中…' : '目前沒有新聞可顯示。'}</p>
      ) : (
        <ul className="news-list">
          {items.map((item) => (
            <li className="news-item" key={item.id}>
              <a href={item.url} target="_blank" rel="noreferrer" className="news-item-title">
                {item.title}
              </a>
              <p className="news-item-meta">
                {item.source} · {formatPublishedAt(item.publishedAt)}
                {item.relatedSymbols.length > 0 ? ` · ${item.relatedSymbols.join(', ')}` : ''}
              </p>
              {item.snippet && <p className="news-item-snippet">{item.snippet}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
