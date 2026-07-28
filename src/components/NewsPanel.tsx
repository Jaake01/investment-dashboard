import { usePortfolio } from '../context/PortfolioContext';
import { useNews } from '../hooks/useNews';

function formatPublishedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function NewsPanel() {
  const { settings } = usePortfolio();
  const { news, hasMore, isLoading, isLoadingMore, error, refresh, loadMore } = useNews();

  const hasApiKey = settings.marketauxApiKey.trim().length > 0;

  return (
    <section className="card">
      <div className="card-header">
        <h2>最新新聞</h2>
        <button className="btn" onClick={refresh} disabled={isLoading || !hasApiKey}>
          {isLoading ? '讀取中…' : '重新整理'}
        </button>
      </div>

      {!hasApiKey ? (
        <p className="empty-state">請先到設定填入 Marketaux API key。</p>
      ) : error ? (
        <p className="form-error">{error}</p>
      ) : news.length === 0 ? (
        <p className="empty-state">{isLoading ? '讀取中…' : '目前沒有新聞可顯示。'}</p>
      ) : (
        <>
          <ul className="news-list">
            {news.map((item) => (
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
          {hasMore && (
            <button className="btn news-load-more" onClick={loadMore} disabled={isLoadingMore}>
              {isLoadingMore ? '讀取中…' : '查看更多'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
