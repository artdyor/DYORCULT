import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './TokenDetail.css';

function TokenDetail() {
  const { address } = useParams();
  const navigate = useNavigate();
  const [tokenData, setTokenData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_URL = 'https://dyorcult-backend.onrender.com';

  useEffect(() => {
    fetchTokenDetails();
  }, [address]);

  const fetchTokenDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/token/${address}`);
      const data = await response.json();

      console.log('Full API response:', data);

      if (data.error) {
        setError(data.error);
      } else {
        console.log('Token data fields:', {
          name: data.name,
          symbol: data.symbol,
          price: data.price,
          marketCap: data.marketCap,
          liquidity: data.liquidity
        });
        setTokenData(data);
        setError(null);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const formatNumber = (num) => {
    if (!num) return '0';
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const formatPrice = (price) => {
    if (!price) return '$0';
    if (price < 0.00001) return `$${price.toExponential(2)}`;
    if (price < 1) return `$${price.toFixed(8)}`;
    return `$${price.toFixed(4)}`;
  };

  if (loading) {
    return (
      <div className="token-detail">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <div>Loading token data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="token-detail">
        <div className="error-screen">
          <h2>Error Loading Token</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')}>Back to Feed</button>
        </div>
      </div>
    );
  }

  if (!tokenData) return null;

  const { name, symbol, image, price, priceChange1h, priceChange24h, marketCap, liquidity, volume24h, buys24h, sells24h, twitter, telegram, website, dex, chain, dexUrl, isVerified, sources } = tokenData;

  return (
    <div className="token-detail">
      <div className="detail-header">
        <button className="back-button" onClick={() => navigate('/')}>
          ← Back to Feed
        </button>
        <div className="header-actions">
          {dexUrl && (
            <a href={dexUrl} target="_blank" rel="noopener noreferrer" className="action-btn">
              📊 View on DexScreener
            </a>
          )}
        </div>
      </div>

      <div className="token-hero">
        <div className="hero-left">
          {image && <img src={image} alt={name} className="token-image-large" />}
          <div className="token-title-section">
            <h1>{name}</h1>
            <div className="token-symbol">${symbol}</div>
            <div className="token-address">
              {address.substring(0, 12)}...{address.substring(address.length - 8)}
              <button onClick={() => copyToClipboard(address)} className="copy-btn">📋</button>
            </div>
            {isVerified && (
              <div className="safety-badge green">✅ Verified</div>
            )}
          </div>
        </div>

        <div className="hero-right">
          <div className="price-section">
            <div className="current-price">{formatPrice(price)}</div>
            <div className="price-changes">
              {priceChange1h !== 0 && (
                <span style={{ color: priceChange1h > 0 ? '#10b981' : '#ef4444' }}>
                  1H: {priceChange1h > 0 ? '+' : ''}{priceChange1h?.toFixed(2)}%
                </span>
              )}
              <span style={{ color: priceChange24h > 0 ? '#10b981' : '#ef4444' }}>
                24H: {priceChange24h > 0 ? '+' : ''}{priceChange24h?.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="market-stats-grid">
            <div className="stat-item">
              <div className="stat-label">Market Cap</div>
              <div className="stat-value">${formatNumber(marketCap)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">24h Volume</div>
              <div className="stat-value">${formatNumber(volume24h)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Liquidity</div>
              <div className="stat-value">${formatNumber(liquidity)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Liquidity/MCap</div>
              <div className="stat-value">
                {marketCap > 0 ? ((liquidity / marketCap) * 100).toFixed(1) : '0'}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TradingView Chart */}
      <div className="detail-card chart-card">
        <h2>📊 Price Chart</h2>
        <div className="chart-container">
          <iframe
            src={`https://dexscreener.com/${chain || 'solana'}/${address}?embed=1&theme=dark&trades=0&info=0`}
            style={{
              width: '100%',
              height: '500px',
              border: 'none',
              borderRadius: 'var(--radius-xl)',
            }}
            title="Token Chart"
          />
        </div>
      </div>

      <div className="detail-content">
        <div className="content-left">
          {/* Trading Activity */}
          <div className="detail-card">
            <h2>📈 Trading Activity</h2>
            <div className="trading-stats">
              <div className="trading-row">
                <span>24h Transactions</span>
                <span className="trading-value">{(buys24h || 0) + (sells24h || 0)}</span>
              </div>
              <div className="trading-row">
                <span>Buys</span>
                <span className="trading-value buy">{buys24h || 0}</span>
              </div>
              <div className="trading-row">
                <span>Sells</span>
                <span className="trading-value sell">{sells24h || 0}</span>
              </div>
              <div className="trading-row">
                <span>Buy/Sell Ratio</span>
                <span className="trading-value">
                  {(buys24h || 0) + (sells24h || 0) > 0
                    ? (((buys24h || 0) / ((buys24h || 0) + (sells24h || 0))) * 100).toFixed(1)
                    : '0'}%
                </span>
              </div>
            </div>
          </div>

          {/* Price Momentum */}
          <div className="detail-card">
            <h2>📊 Price Momentum</h2>
            <div className="momentum-indicators">
              <div className="momentum-item">
                <span className="momentum-label">1H Change</span>
                <span className={`momentum-value ${priceChange1h > 0 ? 'positive' : 'negative'}`}>
                  {priceChange1h > 0 ? '+' : ''}{priceChange1h?.toFixed(2)}%
                </span>
              </div>
              <div className="momentum-item">
                <span className="momentum-label">24H Change</span>
                <span className={`momentum-value ${priceChange24h > 0 ? 'positive' : 'negative'}`}>
                  {priceChange24h > 0 ? '+' : ''}{priceChange24h?.toFixed(2)}%
                </span>
              </div>
              <div className="momentum-trend">
                {Math.abs(priceChange24h || 0) > 50 ? (
                  <div className="trend-badge explosive">🚀 EXPLOSIVE MOMENTUM</div>
                ) : Math.abs(priceChange24h || 0) > 20 ? (
                  <div className="trend-badge strong">💪 STRONG MOVEMENT</div>
                ) : Math.abs(priceChange24h || 0) > 10 ? (
                  <div className="trend-badge moderate">📈 MODERATE ACTIVITY</div>
                ) : (
                  <div className="trend-badge stable">😴 STABLE</div>
                )}
              </div>
            </div>
          </div>

          {/* Liquidity Health */}
          <div className="detail-card">
            <h2>💧 Liquidity Health</h2>
            <div className="liquidity-health">
              <div className="health-metric">
                <span className="health-label">Available Liquidity</span>
                <span className="health-value">${formatNumber(liquidity)}</span>
              </div>
              <div className="health-ratio">
                <span className="health-label">Liquidity / Market Cap</span>
                <span className="health-value">
                  {marketCap > 0 ? ((liquidity / marketCap) * 100).toFixed(1) : '0'}%
                </span>
              </div>
              <div className="health-status">
                {((liquidity / (marketCap || 1))) > 0.5 ? (
                  <div className="status-badge excellent">✅ EXCELLENT - Very liquid</div>
                ) : ((liquidity / (marketCap || 1))) > 0.2 ? (
                  <div className="status-badge good">👍 GOOD - Healthy liquidity</div>
                ) : ((liquidity / (marketCap || 1))) > 0.05 ? (
                  <div className="status-badge fair">⚠️ FAIR - Moderate risk</div>
                ) : (
                  <div className="status-badge poor">🚨 LOW - High slippage risk</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="content-right">
          {/* Social Links */}
          <div className="detail-card">
            <h2>🌐 Social & Links</h2>
            <div className="social-links">
              {twitter && (
                <a href={twitter} target="_blank" rel="noopener noreferrer" className="social-link">
                  🐦 Twitter
                </a>
              )}
              {telegram && (
                <a href={telegram} target="_blank" rel="noopener noreferrer" className="social-link">
                  ✈️ Telegram
                </a>
              )}
              {website && (
                <a href={website} target="_blank" rel="noopener noreferrer" className="social-link">
                  🌍 Website
                </a>
              )}
              {!twitter && !telegram && !website && (
                <div className="no-socials">No social links available</div>
              )}
            </div>
          </div>

          {/* Token Info */}
          <div className="detail-card">
            <h2>ℹ️ Token Information</h2>
            <div className="token-info">
              <div className="info-row">
                <span>DEX</span>
                <span className="info-value">{dex || 'Raydium'}</span>
              </div>
              <div className="info-row">
                <span>Chain</span>
                <span className="info-value">{chain || 'Solana'}</span>
              </div>
              <div className="info-row">
                <span>Verified</span>
                <span className="info-value">{isVerified ? '✅ Yes' : '⚠️ No'}</span>
              </div>
            </div>
          </div>

          {/* Data Sources */}
          <div className="detail-card">
            <h2>📡 Data Sources</h2>
            <div className="data-sources">
              <div className={`source-item ${sources?.dexscreener ? 'active' : ''}`}>
                {sources?.dexscreener ? '✅' : '❌'} DexScreener
              </div>
              <div className={`source-item ${sources?.geckoterminal ? 'active' : ''}`}>
                {sources?.geckoterminal ? '✅' : '❌'} GeckoTerminal
              </div>
              <div className="source-item active">
                ✅ Real-time Data
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TokenDetail;
