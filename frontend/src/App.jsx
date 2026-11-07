import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';

function App() {
  const navigate = useNavigate();
  const [whaleFeed, setWhaleFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({
    safetyTier: 'all',
    transactionType: 'all',
    minAmount: 0
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState(null);
  const [expandedNarratives, setExpandedNarratives] = useState({});
  const [narratives, setNarratives] = useState({});
  const [loadingNarratives, setLoadingNarratives] = useState({});

  const API_URL = 'http://localhost:3001';

  const fetchWhaleFeed = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/whale-feed?limit=30`);
      const data = await response.json();

      if (data.transactions) {
        setWhaleFeed(data.transactions);
        setError(null);
      } else {
        setError('No data received');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWhaleFeed();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchWhaleFeed();
      }, 300000); // 5 minutes

      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const filteredFeed = whaleFeed.filter(tx => {
    if (filter.safetyTier !== 'all' && tx.token?.safety_tier !== filter.safetyTier) {
      return false;
    }
    if (filter.transactionType !== 'all' && tx.transaction_type !== filter.transactionType) {
      return false;
    }
    if (tx.amount_usd < filter.minAmount) {
      return false;
    }
    return true;
  });

  const formatNumber = (num) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const copyToClipboard = async (address) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getDexScreenerUrl = (tokenAddress) => {
    return `https://dexscreener.com/solana/${tokenAddress}`;
  };

  const fetchNarrative = async (tokenAddress) => {
    if (narratives[tokenAddress]) {
      return;
    }

    setLoadingNarratives(prev => ({ ...prev, [tokenAddress]: true }));

    try {
      const response = await fetch(`${API_URL}/api/narrative/${tokenAddress}`);
      const data = await response.json();

      if (data.narrative) {
        setNarratives(prev => ({ ...prev, [tokenAddress]: data.narrative }));
      }
    } catch (err) {
      console.error('Error fetching narrative:', err);
      setNarratives(prev => ({ ...prev, [tokenAddress]: 'Unable to generate narrative.' }));
    } finally {
      setLoadingNarratives(prev => ({ ...prev, [tokenAddress]: false }));
    }
  };

  const toggleNarrative = (tokenAddress) => {
    const isExpanding = !expandedNarratives[tokenAddress];

    setExpandedNarratives(prev => ({
      ...prev,
      [tokenAddress]: isExpanding
    }));

    if (isExpanding && !narratives[tokenAddress]) {
      fetchNarrative(tokenAddress);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <img src="/banner.webp" alt="DYORCULT" className="banner-image" />
        <p>Real-time smart wallet activity on Solana</p>
      </header>

      <div className="controls">
        <div className="filters">
          <select
            value={filter.safetyTier}
            onChange={(e) => setFilter({...filter, safetyTier: e.target.value})}
          >
            <option value="all">All Tiers</option>
            <option value="green">Green (Verified)</option>
            <option value="grey">Grey</option>
            <option value="red">Red</option>
          </select>

          <select
            value={filter.transactionType}
            onChange={(e) => setFilter({...filter, transactionType: e.target.value})}
          >
            <option value="all">Buy & Sell</option>
            <option value="buy">Buys Only</option>
            <option value="sell">Sells Only</option>
          </select>

          <input
            type="number"
            placeholder="Min amount ($)"
            value={filter.minAmount}
            onChange={(e) => setFilter({...filter, minAmount: Number(e.target.value)})}
          />
        </div>

        <div className="refresh-controls">
          <label>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (5min)
          </label>
          <button onClick={fetchWhaleFeed}>Refresh Now</button>
        </div>
      </div>

      {error && (
        <div className="error">
          Error: {error}
        </div>
      )}

      {loading && whaleFeed.length === 0 ? (
        <div className="loading">Loading whale activity...</div>
      ) : (
        <div className="feed">
          <div className="feed-header">
            <span>Showing {filteredFeed.length} transactions</span>
          </div>

          {filteredFeed.map((tx) => (
            <div
              key={tx.id}
              className={`transaction ${tx.transaction_type}`}
            >
              <div className="tx-header">
                <div className="tx-type">
                  <span className={`badge ${tx.transaction_type}`}>
                    {tx.transaction_type === 'buy' ? '🟢 BUY' : '🔴 SELL'}
                  </span>
                  <span className="tx-time">{formatTime(tx.timestamp)}</span>
                </div>
                <div className="tx-amount">
                  {formatNumber(tx.amount_usd)}
                </div>
              </div>

              <div className="tx-body">
                <div className="token-info">
                  <div className="token-name">
                    <span className="symbol">{tx.token?.symbol || 'Unknown'}</span>
                    <span className={`safety-badge ${tx.token?.safety_tier}`}>
                      {tx.token?.safety_tier}
                    </span>
                  </div>
                  <div className="token-details">
                    {tx.token?.name}
                  </div>
                  {tx.token?.token_address && (
                    <div className="token-address">
                      <span className="address-text">
                        {tx.token.token_address.slice(0, 4)}...{tx.token.token_address.slice(-4)}
                      </span>
                      <button
                        className="copy-btn"
                        onClick={() => copyToClipboard(tx.token.token_address)}
                        title="Copy address"
                      >
                        {copiedAddress === tx.token.token_address ? '✓' : '📋'}
                      </button>
                      <a
                        href={getDexScreenerUrl(tx.token.token_address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="chart-link"
                        title="View on DexScreener"
                      >
                        📊 Chart
                      </a>
                      <button
                        className="details-btn"
                        onClick={() => navigate(`/token/${tx.token.token_address}`)}
                        title="View full token details"
                      >
                        🔍 Details
                      </button>
                    </div>
                  )}
                </div>

                <div className="market-info">
                  <div className="info-item">
                    <span className="label">Market Cap:</span>
                    <span className="value">{formatNumber(tx.token_market_cap)}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Action:</span>
                    <span className="value">{tx.action_verb}</span>
                  </div>
                  {tx.wallet_list_type && (
                    <div className="info-item">
                      <span className="label">Wallet:</span>
                      <span className="value">{tx.wallet_list_type}</span>
                    </div>
                  )}
                </div>
              </div>

              {tx.token?.token_address && (
                <div className="narrative-section">
                  <button
                    className="narrative-toggle"
                    onClick={() => navigate(`/token/${tx.token.token_address}`)}
                  >
                    🔍 DYORCULT Info
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
