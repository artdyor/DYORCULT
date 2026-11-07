const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const OpenAI = require('openai');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Store connected clients
const clients = new Set();

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');
  clients.add(ws);

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Broadcast new transactions to all connected clients
function broadcastTransaction(transaction) {
  const message = JSON.stringify({ type: 'new_transaction', data: transaction });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Store last seen transactions to detect new ones
let lastTransactions = [];

// Poll for new transactions and broadcast them
async function pollForNewTransactions() {
  try {
    const response = await callMobyAPI('tools/call', {
      name: 'get_whalewatch_feed',
      arguments: { limit: 30 }
    });

    const content = response.result?.content?.[0];
    const data = content?.structuredContent || JSON.parse(content?.text || '{}');

    if (data.transactions && Array.isArray(data.transactions)) {
      const currentTransactions = data.transactions;

      // Find new transactions (not in lastTransactions)
      if (lastTransactions.length > 0) {
        const newTxs = currentTransactions.filter(tx =>
          !lastTransactions.some(lastTx => lastTx.signature === tx.signature)
        );

        // Broadcast each new transaction
        newTxs.forEach(tx => {
          if (clients.size > 0) {
            console.log('Broadcasting new transaction:', tx.signature);
            broadcastTransaction(tx);
          }
        });
      }

      lastTransactions = currentTransactions;
    }
  } catch (error) {
    console.error('Error polling for new transactions:', error);
  }
}

// Start polling every 10 seconds
setInterval(pollForNewTransactions, 10000);

const MOBY_API_URL = 'https://mcp.moby.win/mcp';
const MOBY_API_KEY = process.env.MOBY_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

let requestId = 0;
const narrativeCache = new Map();

// Fetch token data from DexScreener (free API, no key needed)
async function fetchDexScreenerData(tokenAddress) {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    const data = await response.json();

    if (data.pairs && data.pairs.length > 0) {
      // Get the pair with highest liquidity
      const mainPair = data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      return mainPair;
    }
    return null;
  } catch (error) {
    console.error('DexScreener API error:', error);
    return null;
  }
}

// Fetch token data from GeckoTerminal (free API, no key needed)
async function fetchGeckoTerminalData(tokenAddress) {
  try {
    // GeckoTerminal API for Solana tokens
    const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}`);
    const data = await response.json();

    if (data.data) {
      return data.data;
    }
    return null;
  } catch (error) {
    console.error('GeckoTerminal API error:', error);
    return null;
  }
}

// Fetch pool data from GeckoTerminal for more details
async function fetchGeckoTerminalPoolData(tokenAddress) {
  try {
    const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}/pools`);
    const data = await response.json();

    if (data.data && data.data.length > 0) {
      // Get the pool with highest liquidity
      const mainPool = data.data.sort((a, b) =>
        parseFloat(b.attributes?.reserve_in_usd || 0) - parseFloat(a.attributes?.reserve_in_usd || 0)
      )[0];
      return mainPool;
    }
    return null;
  } catch (error) {
    console.error('GeckoTerminal Pool API error:', error);
    return null;
  }
}

// Fetch OHLCV data from GeckoTerminal for charts
async function fetchGeckoTerminalOHLCV(poolAddress, timeframe = 'day', aggregate = 1) {
  try {
    const response = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=100`
    );
    const data = await response.json();

    if (data.data && data.data.attributes) {
      return data.data.attributes.ohlcv_list;
    }
    return null;
  } catch (error) {
    console.error('GeckoTerminal OHLCV API error:', error);
    return null;
  }
}

// Fetch token data from Pump.fun (free API, no key needed)
async function fetchPumpFunData(tokenAddress) {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${tokenAddress}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Pump.fun API error:', error);
    return null;
  }
}

// Fetch token replies/comments from Pump.fun
async function fetchPumpFunReplies(tokenAddress) {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/replies/${tokenAddress}?limit=10&offset=0`);
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Pump.fun Replies API error:', error);
    return null;
  }
}

// Fetch token data from GMGN.ai (free API, no key needed)
async function fetchGMGNData(tokenAddress) {
  try {
    const response = await fetch(`https://gmgn.ai/defi/quotation/v1/tokens/sol/${tokenAddress}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data?.token;
  } catch (error) {
    console.error('GMGN API error:', error);
    return null;
  }
}

async function callMobyAPI(method, params = {}) {
  requestId++;

  const response = await fetch(MOBY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MOBY_API_KEY}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: requestId
    })
  });

  const text = await response.text();

  // Handle SSE format
  if (text.startsWith('event: message')) {
    const dataLine = text.split('\n').find(line => line.startsWith('data: '));
    if (dataLine) {
      const jsonData = dataLine.substring(6);
      return JSON.parse(jsonData);
    }
  }

  return JSON.parse(text);
}

// Get whale feed
app.get('/api/whale-feed', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const response = await callMobyAPI('tools/call', {
      name: 'get_whalewatch_feed',
      arguments: { limit }
    });

    if (response.error) {
      return res.status(500).json({ error: response.error.message });
    }

    const content = response.result?.content?.[0];
    const data = content?.structuredContent || JSON.parse(content?.text || '{}');

    res.json(data);
  } catch (error) {
    console.error('Error fetching whale feed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get token overview
app.get('/api/token/:address', async (req, res) => {
  try {
    const tokenAddress = req.params.address;
    console.log(`\n=== Fetching token data for: ${tokenAddress} ===`);

    // Try DexScreener first
    try {
      console.log('Trying DexScreener API...');
      const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      const dexData = await dexResponse.json();

      console.log('DexScreener raw response:', JSON.stringify(dexData, null, 2));

      if (dexData.pairs && dexData.pairs.length > 0) {
        const mainPair = dexData.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

        console.log('Main pair selected:', {
          name: mainPair.baseToken?.name,
          symbol: mainPair.baseToken?.symbol,
          priceUsd: mainPair.priceUsd
        });

        const tokenData = {
          name: mainPair.baseToken?.name || 'Unknown Token',
          symbol: mainPair.baseToken?.symbol || '???',
          image: mainPair.info?.imageUrl || null,
          price: parseFloat(mainPair.priceUsd) || 0,
          priceChange1h: parseFloat(mainPair.priceChange?.h1) || 0,
          priceChange24h: parseFloat(mainPair.priceChange?.h24) || 0,
          priceChange6h: parseFloat(mainPair.priceChange?.h6) || 0,
          marketCap: parseFloat(mainPair.fdv) || parseFloat(mainPair.marketCap) || 0,
          liquidity: parseFloat(mainPair.liquidity?.usd) || 0,
          volume24h: parseFloat(mainPair.volume?.h24) || 0,
          buys24h: mainPair.txns?.h24?.buys || 0,
          sells24h: mainPair.txns?.h24?.sells || 0,
          holders: 0,
          twitter: mainPair.info?.socials?.find(s => s.type === 'twitter')?.url || null,
          telegram: mainPair.info?.socials?.find(s => s.type === 'telegram')?.url || null,
          website: mainPair.info?.websites?.[0]?.url || null,
          dex: mainPair.dexId || 'Raydium',
          chain: mainPair.chainId || 'solana',
          dexUrl: mainPair.url || `https://dexscreener.com/solana/${tokenAddress}`,
          pairAddress: mainPair.pairAddress,
          createdAt: mainPair.pairCreatedAt,
          isVerified: mainPair.info?.verified || false,
          sources: {
            dexscreener: true
          }
        };

        console.log('Returning token data:', tokenData);
        return res.json(tokenData);
      }
    } catch (dexError) {
      console.error('DexScreener error:', dexError.message);
    }

    // Fallback to GeckoTerminal
    try {
      console.log('Trying GeckoTerminal API...');
      const geckoResponse = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}`);
      const geckoData = await geckoResponse.json();

      console.log('GeckoTerminal raw response:', JSON.stringify(geckoData, null, 2));

      if (geckoData.data && geckoData.data.attributes) {
        const attrs = geckoData.data.attributes;
        const pools = geckoData.included?.filter(item => item.type === 'pool') || [];
        const mainPool = pools.sort((a, b) =>
          parseFloat(b.attributes?.reserve_in_usd || 0) - parseFloat(a.attributes?.reserve_in_usd || 0)
        )[0]?.attributes;

        const tokenData = {
          name: attrs.name || 'Unknown Token',
          symbol: attrs.symbol || '???',
          image: attrs.image_url || null,
          price: parseFloat(attrs.price_usd) || 0,
          priceChange1h: parseFloat(attrs.price_change_percentage?.h1) || 0,
          priceChange24h: parseFloat(attrs.price_change_percentage?.h24) || 0,
          priceChange6h: 0,
          marketCap: parseFloat(attrs.fdv_usd) || parseFloat(attrs.market_cap_usd) || 0,
          liquidity: parseFloat(mainPool?.reserve_in_usd) || 0,
          volume24h: parseFloat(attrs.volume_usd?.h24) || 0,
          buys24h: mainPool?.transactions?.h24?.buys || 0,
          sells24h: mainPool?.transactions?.h24?.sells || 0,
          holders: 0,
          twitter: attrs.twitter_handle ? `https://twitter.com/${attrs.twitter_handle}` : null,
          telegram: attrs.telegram_handle ? `https://t.me/${attrs.telegram_handle}` : null,
          website: attrs.websites?.[0] || null,
          dex: mainPool?.name || 'Raydium',
          chain: 'solana',
          dexUrl: `https://www.geckoterminal.com/solana/pools/${mainPool?.address || tokenAddress}`,
          pairAddress: mainPool?.address,
          createdAt: mainPool?.pool_created_at,
          isVerified: false,
          sources: {
            geckoterminal: true
          }
        };

        console.log('Returning token data from GeckoTerminal:', tokenData);
        return res.json(tokenData);
      }
    } catch (geckoError) {
      console.error('GeckoTerminal error:', geckoError.message);
    }

    console.log('No data found from any source');
    return res.status(404).json({ error: 'Token not found on any DEX aggregator' });
  } catch (error) {
    console.error('Error fetching token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search tokens
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    const response = await callMobyAPI('tools/call', {
      name: 'search_tokens',
      arguments: { query }
    });

    if (response.error) {
      return res.status(500).json({ error: response.error.message });
    }

    const content = response.result?.content?.[0];
    const data = content?.structuredContent || JSON.parse(content?.text || '{}');

    res.json(data);
  } catch (error) {
    console.error('Error searching tokens:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate AI narrative for a token
app.get('/api/narrative/:address', async (req, res) => {
  try {
    const tokenAddress = req.params.address;

    // Check cache first
    if (narrativeCache.has(tokenAddress)) {
      return res.json(narrativeCache.get(tokenAddress));
    }

    // Fetch from ALL sources in parallel (5 free APIs!)
    const [tokenResponse, dexData, geckoTokenData, geckoPoolData, pumpData, pumpReplies, gmgnData] = await Promise.all([
      callMobyAPI('tools/call', {
        name: 'get_token_overview',
        arguments: { token_address: tokenAddress }
      }),
      fetchDexScreenerData(tokenAddress),
      fetchGeckoTerminalData(tokenAddress),
      fetchGeckoTerminalPoolData(tokenAddress),
      fetchPumpFunData(tokenAddress),
      fetchPumpFunReplies(tokenAddress),
      fetchGMGNData(tokenAddress)
    ]);

    if (tokenResponse.error) {
      return res.status(500).json({ error: tokenResponse.error.message });
    }

    const tokenContent = tokenResponse.result?.content?.[0];
    const tokenData = tokenContent?.structuredContent || JSON.parse(tokenContent?.text || '{}');

    console.log('=== DATA SOURCES ===');
    console.log('Moby:', tokenData?.name || 'N/A');
    console.log('DexScreener:', dexData ? 'OK' : 'N/A');
    console.log('GeckoTerminal:', geckoTokenData ? 'OK' : 'N/A');
    console.log('Pump.fun:', pumpData ? 'OK' : 'N/A');
    console.log('GMGN:', gmgnData ? 'OK' : 'N/A');

    // Generate narrative with data from ALL sources
    const narrative = generateEnhancedNarrative(
      tokenData,
      dexData,
      geckoTokenData,
      geckoPoolData,
      pumpData,
      pumpReplies,
      gmgnData
    );

    const result = {
      tokenAddress,
      narrative,
      generatedAt: new Date().toISOString(),
      sources: {
        moby: !!tokenData,
        dexscreener: !!dexData,
        geckoterminal: !!geckoTokenData,
        pumpfun: !!pumpData,
        gmgn: !!gmgnData
      }
    };

    // Cache for 30 minutes
    narrativeCache.set(tokenAddress, result);
    setTimeout(() => narrativeCache.delete(tokenAddress), 30 * 60 * 1000);

    res.json(result);
  } catch (error) {
    console.error('Error generating narrative:', error);
    res.status(500).json({ error: error.message });
  }
});

function generateEnhancedNarrative(tokenData, dexData, geckoTokenData, geckoPoolData, pumpData, pumpReplies, gmgnData) {
  const geckoAttrs = geckoTokenData?.attributes || {};
  const geckoPoolAttrs = geckoPoolData?.attributes || {};

  const name = tokenData.name || dexData?.baseToken?.name || geckoAttrs.name || pumpData?.name || gmgnData?.name || 'Unknown Token';
  const symbol = tokenData.symbol || dexData?.baseToken?.symbol || geckoAttrs.symbol || pumpData?.symbol || gmgnData?.symbol || '???';
  const marketCap = parseFloat(dexData?.marketCap || geckoPoolAttrs.market_cap_usd || pumpData?.usd_market_cap || gmgnData?.market_cap || tokenData.market_cap || tokenData.marketCap || 0);
  const priceChange = parseFloat(dexData?.priceChange?.h24 || geckoPoolAttrs.price_change_percentage?.h24 || tokenData.price_change_24h || tokenData.priceChange24h || 0);
  const volume24h = parseFloat(dexData?.volume?.h24 || geckoPoolAttrs.volume_usd?.h24 || tokenData.volume_24h || tokenData.volume24h || 0);
  const liquidity = parseFloat(dexData?.liquidity?.usd || geckoPoolAttrs.reserve_in_usd || 0);
  const txns24h = dexData?.txns?.h24 || geckoPoolAttrs.transactions?.h24 || {};
  const buys = parseInt(txns24h.buys || geckoPoolAttrs.transactions?.h24?.buys || 0);
  const sells = parseInt(txns24h.sells || geckoPoolAttrs.transactions?.h24?.sells || 0);
  const priceUsd = parseFloat(dexData?.priceUsd || geckoPoolAttrs.token_price_usd || gmgnData?.price || tokenData.price_usd || 0);
  const launchpad = tokenData.launchpad || (pumpData ? 'pump.fun' : 'unknown');
  const whaleCount = parseInt(tokenData.whale_count || tokenData.whaleCount || 0);
  const holderCount = parseInt(tokenData.holder_count || tokenData.holderCount || gmgnData?.holder_count || 0);
  const isVerified = tokenData.is_verified || tokenData.isVerified || false;
  const description = tokenData.description || geckoAttrs.description || pumpData?.description || '';
  const createdAt = dexData?.pairCreatedAt || geckoPoolAttrs.pool_created_at || pumpData?.created_timestamp || tokenData.created_timestamp;

  // Social metrics from multiple sources
  const websites = geckoAttrs.websites || (pumpData?.website ? [pumpData.website] : []);
  const twitterHandle = geckoAttrs.twitter_handle || pumpData?.twitter;
  const telegramHandle = geckoAttrs.telegram_handle || pumpData?.telegram;

  // Pump.fun specific data
  const creator = pumpData?.creator;
  const bondingCurveProgress = pumpData?.bonding_curve_percentage;
  const replyCount = pumpReplies?.length || 0;

  // GMGN smart money data
  const smartMoneyBuys = gmgnData?.smart_money?.buy_count || 0;
  const smartMoneySells = gmgnData?.smart_money?.sell_count || 0;
  const topHolders = gmgnData?.top_holders || [];

  let sections = [];

  // NARRATIVE Section
  let narrativeText = '';
  if (description) {
    narrativeText = description;
  } else {
    narrativeText = `${name} is a ${isVerified ? 'verified' : 'community-driven'} token on Solana`;

    if (launchpad === 'pump.fun') {
      narrativeText += `, launched via Pump.fun`;
      if (creator) {
        narrativeText += ` by creator ${creator.substring(0, 8)}...`;
      }
      narrativeText += `. This is a community-driven meme token with ${bondingCurveProgress ? `${bondingCurveProgress.toFixed(1)}% bonding curve progress` : 'active trading'}.`;

      if (bondingCurveProgress && bondingCurveProgress >= 80) {
        narrativeText += ` Near graduation to Raydium - strong community backing!`;
      } else if (bondingCurveProgress && bondingCurveProgress >= 50) {
        narrativeText += ` Halfway to Raydium graduation - momentum building.`;
      }
    } else if (launchpad.includes('raydium')) {
      narrativeText += `, listed on Raydium DEX with established liquidity pools and active trading.`;
    } else if (launchpad !== 'unknown') {
      narrativeText += `, deployed through ${launchpad}.`;
    } else {
      narrativeText += `.`;
    }

    // Add smart money context from GMGN
    if (smartMoneyBuys > 0 || smartMoneySells > 0) {
      const smRatio = smartMoneyBuys + smartMoneySells > 0 ? (smartMoneyBuys / (smartMoneyBuys + smartMoneySells)) * 100 : 50;
      if (smRatio > 70) {
        narrativeText += ` Smart money is HEAVILY ACCUMULATING with ${smartMoneyBuys} buys vs ${smartMoneySells} sells.`;
      } else if (smRatio > 55) {
        narrativeText += ` Smart money showing net buying with ${smartMoneyBuys} buys.`;
      } else if (smRatio < 30) {
        narrativeText += ` Smart money is DISTRIBUTING with ${smartMoneySells} sells vs ${smartMoneyBuys} buys.`;
      }
    }

    // Add whale context
    if (whaleCount > 10) {
      narrativeText += ` Notable smart money presence with ${whaleCount} tracked whale wallets accumulating positions.`;
    } else if (whaleCount > 5) {
      narrativeText += ` ${whaleCount} whale wallets are currently holding, indicating moderate institutional interest.`;
    } else if (whaleCount > 0) {
      narrativeText += ` Early-stage interest from ${whaleCount} whale wallet(s).`;
    }

    // Add market context
    if (marketCap > 10000000) {
      narrativeText += ` With a market cap of $${(marketCap / 1000000).toFixed(1)}M, this token has established presence in the market.`;
    } else if (marketCap > 1000000) {
      narrativeText += ` Currently at $${(marketCap / 1000000).toFixed(2)}M market cap, showing growth potential in the small-cap segment.`;
    } else if (marketCap > 100000) {
      narrativeText += ` Micro-cap token at $${(marketCap / 1000).toFixed(0)}K, representing high-risk, high-reward early-stage opportunity.`;
    }
  }

  sections.push({
    title: 'NARRATIVE',
    content: narrativeText
  });

  // SENTIMENT Section
  let sentimentText = '';
  const buyRatio = buys + sells > 0 ? (buys / (buys + sells)) * 100 : 50;

  if (priceChange > 50) {
    sentimentText = `The market is showing EXTREMELY BULLISH sentiment with a ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(0)}% price movement in the last 24 hours. `;
  } else if (priceChange > 20) {
    sentimentText = `Strong BULLISH momentum is evident with ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(0)}% gains in 24h. `;
  } else if (priceChange > 0) {
    sentimentText = `Positive market sentiment with ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}% upward movement. `;
  } else if (priceChange > -20) {
    sentimentText = `Mixed sentiment with ${priceChange.toFixed(1)}% price action, suggesting consolidation or profit-taking. `;
  } else {
    sentimentText = `BEARISH pressure is visible with ${priceChange.toFixed(0)}% decline, indicating selling activity. `;
  }

  if (buys + sells > 50) {
    sentimentText += `High trading activity with ${buys + sells} transactions recorded. `;
    if (buyRatio > 60) {
      sentimentText += `Strong buying pressure dominates at ${buyRatio.toFixed(0)}% buy ratio, suggesting accumulation phase.`;
    } else if (buyRatio < 40) {
      sentimentText += `Distribution phase evident with ${(100 - buyRatio).toFixed(0)}% sell ratio, indicating profit-taking or exit activity.`;
    } else {
      sentimentText += `Balanced buy/sell ratio at ${buyRatio.toFixed(0)}%, showing market equilibrium.`;
    }
  } else if (buys + sells > 10) {
    sentimentText += `Moderate activity with ${buys + sells} transactions. `;
    if (volume24h > 100000) {
      sentimentText += `Despite moderate transaction count, volume remains healthy at $${(volume24h / 1000).toFixed(0)}K.`;
    } else {
      sentimentText += `Volume is relatively low, suggesting early stage or low liquidity conditions.`;
    }
  } else {
    sentimentText += `Low trading activity with only ${buys + sells} transactions, indicating limited market participation or very early stage.`;
  }

  // Add community sentiment from Pump.fun replies
  if (replyCount > 0) {
    sentimentText += `\n\nCommunity Engagement: ${replyCount} comments on Pump.fun`;
    if (replyCount > 50) {
      sentimentText += ` - HIGH community interest and active discussion.`;
    } else if (replyCount > 20) {
      sentimentText += ` - Growing community engagement.`;
    } else {
      sentimentText += ` - Early community forming.`;
    }
  }

  sections.push({
    title: 'SENTIMENT',
    content: sentimentText
  });

  // METRICS Section
  let metricsText = '';

  // Token Age
  if (createdAt) {
    const ageMs = Date.now() - new Date(createdAt).getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));

    if (ageDays > 30) {
      metricsText += `Token Age: ${ageDays} days (Established)\n`;
    } else if (ageDays > 7) {
      metricsText += `Token Age: ${ageDays} days (Growing)\n`;
    } else if (ageDays > 0) {
      metricsText += `Token Age: ${ageDays} day(s) (Fresh Launch)\n`;
    } else {
      metricsText += `Token Age: ${ageHours} hour(s) (Brand New 🚀)\n`;
    }
  }

  // Price & Market Cap
  if (priceUsd > 0) {
    metricsText += `Price: $${priceUsd < 0.0001 ? priceUsd.toExponential(2) : priceUsd.toFixed(priceUsd < 1 ? 6 : 4)}\n`;
  }

  if (marketCap > 0) {
    metricsText += `Market Cap: $${marketCap > 1000000 ? (marketCap / 1000000).toFixed(2) + 'M' : (marketCap / 1000).toFixed(0) + 'K'}\n`;
  }

  // Liquidity
  if (liquidity > 0) {
    metricsText += `Liquidity: $${liquidity > 1000000 ? (liquidity / 1000000).toFixed(2) + 'M' : (liquidity / 1000).toFixed(0) + 'K'}`;
    if (liquidity < 10000) {
      metricsText += ` ⚠️ LOW LIQUIDITY`;
    } else if (liquidity > 500000) {
      metricsText += ` ✅ STRONG`;
    }
    metricsText += `\n`;
  }

  // Volume
  if (volume24h > 0) {
    metricsText += `24h Volume: $${volume24h > 1000000 ? (volume24h / 1000000).toFixed(2) + 'M' : (volume24h / 1000).toFixed(0) + 'K'}\n`;
  }

  // Holders & Whales
  if (holderCount > 0) {
    metricsText += `Holders: ${holderCount.toLocaleString()}\n`;
  }

  if (whaleCount > 0) {
    metricsText += `Whales: ${whaleCount} tracked smart money wallets\n`;
  }

  // Buy/Sell Activity
  if (buys + sells > 0) {
    metricsText += `24h Transactions: ${buys} buys / ${sells} sells (${buyRatio.toFixed(0)}% buy ratio)`;
  }

  sections.push({
    title: 'KEY METRICS',
    content: metricsText
  });

  // SOCIAL PRESENCE Section
  let socialText = '';

  if (twitterHandle || telegramHandle || websites.length > 0) {
    socialText += 'Community Channels:\n';

    if (twitterHandle) {
      socialText += `Twitter: @${twitterHandle}\n`;
    }

    if (telegramHandle) {
      socialText += `Telegram: ${telegramHandle}\n`;
    }

    if (websites.length > 0) {
      socialText += `Website: ${websites[0]}\n`;
    }

    socialText += '\n';
  }

  // Pump.fun creator info
  if (creator) {
    socialText += `🎨 Token Creator: ${creator.substring(0, 12)}...\n`;
    if (bondingCurveProgress) {
      socialText += `📊 Bonding Curve: ${bondingCurveProgress.toFixed(1)}% complete\n`;
    }
    socialText += '\n';
  }

  // Activity indicators
  if (buys + sells > 50) {
    socialText += `📱 HIGH community engagement with ${buys + sells} transactions in 24h.\n`;
  } else if (buys + sells > 20) {
    socialText += `📱 MODERATE community activity with ${buys + sells} transactions.\n`;
  } else if (buys + sells > 0) {
    socialText += `📱 LOW community activity with ${buys + sells} transactions.\n`;
  }

  // Community sentiment from replies
  if (replyCount > 50) {
    socialText += `💬 VERY ACTIVE community with ${replyCount}+ comments on Pump.fun\n`;
  } else if (replyCount > 20) {
    socialText += `💬 Growing community with ${replyCount} comments\n`;
  } else if (replyCount > 0) {
    socialText += `💬 Early community with ${replyCount} comments\n`;
  }

  socialText += '\n';

  // Smart money engagement (GMGN + Moby data)
  if (smartMoneyBuys > 0 || smartMoneySells > 0) {
    const smRatio = smartMoneyBuys + smartMoneySells > 0 ? (smartMoneyBuys / (smartMoneyBuys + smartMoneySells)) * 100 : 50;
    socialText += `🧠 Smart Money Activity: ${smartMoneyBuys} buys / ${smartMoneySells} sells (${smRatio.toFixed(0)}% buy ratio)\n`;
  }

  // Whale engagement
  if (whaleCount > 10) {
    socialText += `🐋 Strong whale interest: ${whaleCount} whale wallets are actively watching and accumulating.`;
  } else if (whaleCount > 5) {
    socialText += `🐋 Notable whale interest: ${whaleCount} smart money wallets are positioned.`;
  } else if (whaleCount > 0) {
    socialText += `🐋 Early whale interest: ${whaleCount} smart money wallet(s) monitoring.`;
  } else {
    socialText += `🐋 No tracked whale engagement yet - purely retail-driven or very early stage.`;
  }

  if (socialText) {
    sections.push({
      title: 'SOCIAL & COMMUNITY',
      content: socialText
    });
  }

  // RISK ASSESSMENT Section
  const risks = [];
  if (!isVerified) risks.push('Unverified contract');
  if (whaleCount === 0) risks.push('No whale backing');
  if (liquidity < 10000) risks.push('Very low liquidity');
  if (liquidity < 50000 && marketCap > 1000000) risks.push('Low liquidity vs market cap ratio');
  if (holderCount < 100) risks.push('Small holder base');
  if (priceChange < -50) risks.push('Heavy selloff in progress');
  if (buyRatio < 30 && buys + sells > 10) risks.push('Sell pressure dominates');

  let riskText = '';
  if (risks.length === 0) {
    riskText = '✅ LOWER RISK\n\nThis token shows strong fundamentals with verified status, whale support, and healthy metrics. Always conduct your own research before investing.';
  } else if (risks.length <= 2) {
    riskText = `⚠️ MODERATE RISK\n\nIdentified concerns: ${risks.join(', ')}.\n\nWhile some risk factors are present, the token shows potential. Research thoroughly and only invest what you can afford to lose.`;
  } else {
    riskText = `🚨 HIGH RISK\n\nMultiple risk factors: ${risks.join(', ')}.\n\nEXTREME CAUTION: This token exhibits several high-risk characteristics. Only invest funds you can afford to lose completely. Not financial advice.`;
  }

  sections.push({
    title: 'RISK ASSESSMENT',
    content: riskText
  });

  // Format all sections
  let fullNarrative = '';
  sections.forEach((section, index) => {
    if (index > 0) fullNarrative += '\n\n';
    fullNarrative += `**${section.title}**\n\n${section.content}`;
  });

  return fullNarrative;
}

// Comprehensive token details endpoint - ALL data from ALL sources
app.get('/api/token-details/:address', async (req, res) => {
  try {
    const tokenAddress = req.params.address;

    // Fetch from ALL sources in parallel
    const [tokenResponse, dexData, geckoTokenData, geckoPoolData, pumpData, pumpReplies, gmgnData] = await Promise.all([
      callMobyAPI('tools/call', {
        name: 'get_token_overview',
        arguments: { token_address: tokenAddress }
      }),
      fetchDexScreenerData(tokenAddress),
      fetchGeckoTerminalData(tokenAddress),
      fetchGeckoTerminalPoolData(tokenAddress),
      fetchPumpFunData(tokenAddress),
      fetchPumpFunReplies(tokenAddress),
      fetchGMGNData(tokenAddress)
    ]);

    const tokenContent = tokenResponse.result?.content?.[0];
    const mobyData = tokenContent?.structuredContent || JSON.parse(tokenContent?.text || '{}');

    // Get OHLCV data for charts if we have a pool
    let chartData = null;
    if (geckoPoolData?.id) {
      const [ohlcv1h, ohlcv24h] = await Promise.all([
        fetchGeckoTerminalOHLCV(geckoPoolData.id, 'hour', 1),
        fetchGeckoTerminalOHLCV(geckoPoolData.id, 'day', 1)
      ]);
      chartData = {
        hour: ohlcv1h,
        day: ohlcv24h
      };
    }

    // Aggregate all data into a comprehensive response
    const comprehensiveData = {
      address: tokenAddress,
      timestamp: new Date().toISOString(),

      // Basic Info
      basic: {
        name: mobyData.name || dexData?.baseToken?.name || pumpData?.name || gmgnData?.name || 'Unknown',
        symbol: mobyData.symbol || dexData?.baseToken?.symbol || pumpData?.symbol || gmgnData?.symbol || '???',
        description: mobyData.description || pumpData?.description || '',
        image: pumpData?.image_uri || dexData?.info?.imageUrl || gmgnData?.logo,
        creator: pumpData?.creator,
        createdAt: dexData?.pairCreatedAt || pumpData?.created_timestamp
      },

      // Price & Market Data
      market: {
        priceUsd: parseFloat(dexData?.priceUsd || gmgnData?.price || 0),
        marketCap: parseFloat(dexData?.marketCap || gmgnData?.market_cap || pumpData?.usd_market_cap || 0),
        fdv: parseFloat(gmgnData?.fdv || 0),
        volume24h: parseFloat(dexData?.volume?.h24 || gmgnData?.volume_24h || 0),
        priceChange24h: parseFloat(dexData?.priceChange?.h24 || gmgnData?.price_change_24h || 0),
        priceChange1h: parseFloat(gmgnData?.price_change_1h || 0),
        priceChange5m: parseFloat(gmgnData?.price_change_5m || 0)
      },

      // Liquidity
      liquidity: {
        totalUsd: parseFloat(dexData?.liquidity?.usd || 0),
        base: parseFloat(dexData?.liquidity?.base || 0),
        quote: parseFloat(dexData?.liquidity?.quote || 0)
      },

      // Trading Activity
      trading: {
        txns24h: {
          buys: parseInt(dexData?.txns?.h24?.buys || 0),
          sells: parseInt(dexData?.txns?.h24?.sells || 0),
          total: parseInt((dexData?.txns?.h24?.buys || 0) + (dexData?.txns?.h24?.sells || 0))
        },
        txns1h: {
          buys: parseInt(dexData?.txns?.h1?.buys || 0),
          sells: parseInt(dexData?.txns?.h1?.sells || 0)
        },
        buyRatio24h: dexData?.txns?.h24?.buys && dexData?.txns?.h24?.sells ?
          ((dexData.txns.h24.buys / (dexData.txns.h24.buys + dexData.txns.h24.sells)) * 100) : 50
      },

      // Holders & Distribution
      holders: {
        total: parseInt(mobyData.holder_count || gmgnData?.holder_count || 0),
        whales: parseInt(mobyData.whale_count || 0),
        topHolders: gmgnData?.top_holders || []
      },

      // Smart Money (GMGN)
      smartMoney: {
        buyCount: parseInt(gmgnData?.smart_money?.buy_count || 0),
        sellCount: parseInt(gmgnData?.smart_money?.sell_count || 0),
        netFlow: parseFloat(gmgnData?.smart_money?.net_flow || 0)
      },

      // Pump.fun Specific
      pumpfun: pumpData ? {
        bondingCurveProgress: parseFloat(pumpData.bonding_curve_percentage || 0),
        totalSupply: parseFloat(pumpData.total_supply || 0),
        replyCount: pumpReplies?.length || 0,
        recentReplies: pumpReplies?.slice(0, 10) || []
      } : null,

      // Social Links
      social: {
        twitter: pumpData?.twitter || geckoTokenData?.attributes?.twitter_handle,
        telegram: pumpData?.telegram || geckoTokenData?.attributes?.telegram_handle,
        website: pumpData?.website || (geckoTokenData?.attributes?.websites?.[0]),
        discord: pumpData?.discord
      },

      // DEX Info
      dex: {
        name: dexData?.dexId || 'unknown',
        pairAddress: dexData?.pairAddress,
        url: dexData?.url
      },

      // Safety & Verification
      safety: {
        isVerified: mobyData.is_verified || false,
        safetyTier: mobyData.safety_tier,
        launchpad: mobyData.launchpad || (pumpData ? 'pump.fun' : 'unknown')
      },

      // Chart Data (OHLCV from GeckoTerminal)
      chartData: chartData,

      // Pool Info from GeckoTerminal
      pool: geckoPoolData ? {
        id: geckoPoolData.id,
        address: geckoPoolData.attributes?.address,
        name: geckoPoolData.attributes?.name,
        poolCreatedAt: geckoPoolData.attributes?.pool_created_at
      } : null,

      // Data source availability
      sources: {
        moby: !!mobyData.name,
        dexscreener: !!dexData,
        geckoterminal: !!geckoTokenData,
        pumpfun: !!pumpData,
        gmgn: !!gmgnData
      }
    };

    res.json(comprehensiveData);
  } catch (error) {
    console.error('Error fetching comprehensive token details:', error);
    res.status(500).json({ error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Moby Whale Tracker backend running on port ${PORT}`);
  console.log(`WebSocket server ready for real-time updates`);
  // Start polling for new transactions
  pollForNewTransactions();
});
