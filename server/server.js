const express = require('express');
const cors = require('cors');
const { ChromaClient } = require('chromadb');
const OpenAI = require('openai');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize ChromaDB in embedded mode

let chroma = null;
let collection = null;
let openai = null;
let openaiConfig = { apiKey: null, baseURL: null };

// Basic text normalizer + hash for dedupe
function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '') // strip URLs
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();
}

function hashText(text) {
  const norm = normalizeText(text);
  return crypto.createHash('sha1').update(norm).digest('hex');
}

function sanitizeBaseURL(baseURL) {
  const defaultBase = 'https://api.openai.com/v1';
  if (!baseURL || typeof baseURL !== 'string') {
    return defaultBase;
  }

  const ensureScheme = (value) => {
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
    return `https://${value}`;
  };

  const trimSuffixes = (inputPath) => {
    let cleaned = (inputPath || '').replace(/\/+$/, '');
    const lower = cleaned.toLowerCase();
    const suffixes = [
      '/v1/chat/completions',
      '/chat/completions',
      '/v1/completions',
      '/completions'
    ];
    for (const suffix of suffixes) {
      if (lower.endsWith(suffix)) {
        cleaned = cleaned.slice(0, -suffix.length);
        break;
      }
    }
    return cleaned;
  };

  try {
    const url = new URL(ensureScheme(baseURL.trim()));
    const trimmedPath = trimSuffixes(url.pathname);
    url.pathname = trimmedPath || '';
    url.search = '';
    url.hash = '';

    let normalized = url.toString().replace(/\/+$/, '');
    if (!normalized.toLowerCase().endsWith('/v1')) {
      normalized = `${normalized}/v1`;
    }
    return normalized;
  } catch (error) {
    const fallback = ensureScheme(baseURL.trim());
    if (!/^https?:\/\//i.test(fallback)) {
      return defaultBase;
    }
    let cleaned = trimSuffixes(fallback);
    cleaned = cleaned.replace(/\/+$/, '');
    if (!cleaned.toLowerCase().endsWith('/v1')) {
      cleaned = `${cleaned}/v1`;
    }
    return cleaned;
  }
}

function buildOpenAIErrorMessage(error) {
  if (error && error.response) {
    const status = error.response.status;
    const data = error.response.data;
    if (status === 404) {
      return 'OpenAI API returned 404. Verify your Completions URL points to the API base (e.g. https://api.openai.com/v1) and that the requested model exists.';
    }
    if (data && typeof data === 'object') {
      if (typeof data.error === 'string') {
        return data.error;
      }
      if (data.error && typeof data.error.message === 'string') {
        return data.error.message;
      }
    }
    return `OpenAI API error (status ${status})`;
  }
  if (error && error.message) {
    return error.message;
  }
  return 'Unknown OpenAI client error';
}

function parseJSONResponse(content) {
  if (!content) {
    throw new Error('Model returned empty response');
  }

  let cleaned = content.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const fallbackMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (fallbackMatch) {
      try {
        return JSON.parse(fallbackMatch[1]);
      } catch (fallbackError) {
        throw new Error(`Model response was not valid JSON: ${fallbackError.message}`);
      }
    }
    throw new Error(`Model response was not valid JSON: ${error.message}`);
  }
}



// Initialize ChromaDB collection
async function initializeCollection() {
  const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';

  try {
    chroma = new ChromaClient({ path: chromaUrl });
    collection = await chroma.getCollection({ name: 'x_tweets' });
    console.log('Connected to existing collection at', chromaUrl);
  } catch (error) {
    console.warn('Unable to get collection, creating a new one...', error.message);
    chroma = chroma || new ChromaClient({ path: chromaUrl });
    collection = await chroma.createCollection({
      name: 'x_tweets',
      metadata: { description: 'X.com tweets with embeddings' }
    });
    console.log('Created new collection at', chromaUrl);
  }
}

function normalizeTimestamp(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return new Date(parsed).toISOString();
}

// Initialize OpenAI client
function initializeOpenAI(apiKey, baseURL) {
  const cleanBaseURL = sanitizeBaseURL(baseURL);

  if (openai && openaiConfig.apiKey === apiKey && openaiConfig.baseURL === cleanBaseURL) {
    return;
  }

  openai = new OpenAI({
    apiKey: apiKey,
    baseURL: cleanBaseURL
  });
  openaiConfig = { apiKey, baseURL: cleanBaseURL };
}

// Generate embeddings
async function generateEmbedding(text) {
  if (!openai) {
    throw new Error('OpenAI client not initialized');
  }
  
  if (!openai.embeddings || typeof openai.embeddings.create !== 'function') {
    throw new Error('Configured OpenAI endpoint does not support embeddings. Verify your base URL and provider.');
  }

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });
    return response.data[0].embedding;
  } catch (error) {
    const message = buildOpenAIErrorMessage(error);
    console.error('Error generating embedding:', message);
    throw new Error(message);
  }
}

// Analyze tweet for toxicity and bot likelihood
async function analyzeTweet(tweetText, userInfo, modelName) {
  if (!openai) {
    throw new Error('OpenAI client not initialized');
  }

  const prompt = `Analyze this tweet for toxicity and bot likelihood:

Tweet: "${tweetText}"
User: @${userInfo.username} (${userInfo.displayName})
Followers: ${userInfo.followersCount}
Following: ${userInfo.followingCount}
Account Age: ${userInfo.accountAge} days

Provide a JSON response with:
{
  "toxicity_score": 0-10,
  "bot_likelihood": 0-10,
  "analysis": "brief explanation",
  "red_flags": ["list", "of", "flags"]
}
Return only the JSON object with double-quoted keys and numeric values.`;

  if (!openai.chat || !openai.chat.completions || typeof openai.chat.completions.create !== 'function') {
    throw new Error('Configured OpenAI endpoint does not support chat.completions. Verify your base URL and provider.');
  }

  try {
    const response = await openai.chat.completions.create({
      model: modelName || 'gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    });

    const content = response.choices && response.choices[0] && response.choices[0].message ? response.choices[0].message.content : '';
    return parseJSONResponse(content);
  } catch (error) {
    const message = buildOpenAIErrorMessage(error);
    console.error('Error analyzing tweet:', message);
    return {
      toxicity_score: 0,
      bot_likelihood: 0,
      analysis: message,
      red_flags: []
    };
  }
}

// Store tweet in ChromaDB
app.post('/api/store-tweet', async (req, res) => {
  try {
    const { tweet, userInfo, apiKey, baseURL, model, options } = req.body;

    const shouldAnalyze = options && Object.prototype.hasOwnProperty.call(options, 'analyze')
      ? Boolean(options.analyze)
      : true;
    const shouldStore = options && Object.prototype.hasOwnProperty.call(options, 'store')
      ? Boolean(options.store)
      : true;

    if (!shouldAnalyze && !shouldStore) {
      return res.json({
        success: true,
        analysis: null,
        stored: false,
        metadata: null,
        message: 'No processing requested.'
      });
    }

    // Initialize OpenAI client with the latest configuration
    initializeOpenAI(apiKey, baseURL);

    let analysis = null;
    if (shouldAnalyze) {
      analysis = await analyzeTweet(tweet.text, userInfo, model);
    }

    let stored = false;
    let metadataSummary = null;

    if (shouldStore) {
      // Build a stable ID for dedupe: prefer tweet id; else hash of normalized text
      const textHash = hashText(tweet.text || '');
      const stableId = tweet.id ? `tweet_${tweet.id}` : `text_${textHash}`;

      // Check for existing doc by ID to avoid duplicates
      try {
        const existing = await collection.get({ ids: [stableId] });
        const alreadyExists = existing && Array.isArray(existing.ids) && existing.ids.length > 0;
        if (alreadyExists) {
          const message = shouldAnalyze
            ? 'Duplicate tweet skipped (analysis returned).'
            : 'Duplicate tweet skipped.';
          return res.json({
            success: true,
            analysis: shouldAnalyze ? analysis : null,
            stored: false,
            metadata: null,
            message
          });
        }
      } catch (e) {
        // If get-by-id is not supported, continue without failing
      }

      const embedding = await generateEmbedding(tweet.text);

      const storedAt = new Date().toISOString();
      const tweetTimestamp = normalizeTimestamp(tweet && tweet.timestamp, storedAt);

      const analysisForMetadata = analysis || {
        toxicity_score: 0,
        bot_likelihood: 0,
        analysis: shouldAnalyze ? 'Analysis unavailable.' : 'Analysis skipped (disabled).',
        red_flags: []
      };

      const metadata = {
        text: tweet.text,
        author: userInfo.username,
        displayName: userInfo.displayName,
        tweetId: tweet.id || null,
        textHash: textHash,
        tweetedAt: tweetTimestamp,
        scrapedAt: storedAt,
        timestamp: tweetTimestamp,
        likes: Number(tweet.likes ?? 0),
        retweets: Number(tweet.retweets ?? 0),
        replies: Number(tweet.replies ?? 0),
        followers: Number(userInfo.followersCount ?? 0),
        following: Number(userInfo.followingCount ?? 0),
        accountAge: Number(userInfo.accountAge ?? 0),
        toxicity_score: Number(analysisForMetadata.toxicity_score ?? 0),
        bot_likelihood: Number(analysisForMetadata.bot_likelihood ?? 0),
        analysis: analysisForMetadata.analysis || '',
        red_flags: JSON.stringify(Array.isArray(analysisForMetadata.red_flags) ? analysisForMetadata.red_flags : [])
      };

      await collection.add({
        ids: [stableId],
        embeddings: [embedding],
        metadatas: [metadata],
        documents: [tweet.text]
      });

      stored = true;
      metadataSummary = {
        tweetId: metadata.tweetId,
        tweetedAt: metadata.tweetedAt,
        scrapedAt: metadata.scrapedAt
      };
    }

    const message = shouldStore
      ? shouldAnalyze
        ? 'Tweet analyzed and stored successfully.'
        : 'Tweet stored successfully (analysis disabled).'
      : 'Tweet analyzed successfully.';

    res.json({
      success: true,
      analysis: shouldAnalyze ? analysis : null,
      stored,
      metadata: metadataSummary,
      message
    });
  } catch (error) {
    const message = buildOpenAIErrorMessage(error);
    console.error('Error storing tweet:', message);
    res.status(500).json({ 
      success: false, 
      error: message 
    });
  }
});

// Query tweets using RAG
app.post('/api/query', async (req, res) => {
  try {
    const { query, apiKey, baseURL, model, maxResults, dedupe } = req.body;
    
    initializeOpenAI(apiKey, baseURL);

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);
    
    // Configure requested size and dedupe behavior
    const target = Number.isFinite(Number(maxResults)) && Number(maxResults) > 0
      ? Math.floor(Number(maxResults))
      : 10;
    const doDedupe = dedupe !== false; // default true

    let filtered = [];

    if (!doDedupe) {
      // No dedupe: return exactly target in rank order
      const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: target
      });
      const documents = (results.documents && results.documents[0]) || [];
      const metadatas = (results.metadatas && results.metadatas[0]) || [];

      if (!documents.length) {
        return res.json({
          success: false,
          answer: '',
          sources: [],
          totalResults: 0,
          error: 'No tweets matched your query yet. Try analyzing more tweets first.'
        });
      }

      filtered = documents.map((doc, i) => ({ doc, meta: metadatas[i] || {} })).slice(0, target);
    } else {
      // Dedupe by tweetId/textHash/result id, no author caps; fill to target
      let k = Math.max(target, Math.min(2 * target, 50));
      const maxK = Math.min(target * 5, 500);
      const seenTweetIds = new Set();
      const seenHashes = new Set();
      const seenGenericIds = new Set();

      while (true) {
        const results = await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: k
        });

        const documents = (results.documents && results.documents[0]) || [];
        const metadatas = (results.metadatas && results.metadatas[0]) || [];
        const ids = (results.ids && results.ids[0]) || [];

        for (let i = 0; i < documents.length && filtered.length < target; i++) {
          const doc = documents[i];
          const meta = metadatas[i] || {};
          const rid = ids[i];

          const textHash = meta.textHash || hashText(meta.text || doc || '');
          const tweetId = meta.tweetId ? String(meta.tweetId) : null;
          const genericId = rid ? String(rid) : null;

          if (tweetId && seenTweetIds.has(tweetId)) continue;
          if (textHash && seenHashes.has(textHash)) continue;
          if (!tweetId && !textHash && genericId && seenGenericIds.has(genericId)) continue;

          if (tweetId) seenTweetIds.add(tweetId);
          if (textHash) seenHashes.add(textHash);
          if (!tweetId && !textHash && genericId) seenGenericIds.add(genericId);

          filtered.push({ doc, meta });
        }

        if (filtered.length >= target) break;
        if (documents.length < k) break; // not enough items in the DB
        if (k >= maxK) break;
        k = Math.min(k + target, maxK);
      }

      if (!filtered.length) {
        return res.json({
          success: false,
          answer: '',
          sources: [],
          totalResults: 0,
          error: 'No tweets matched your query yet. Try analyzing more tweets first.'
        });
      }
      filtered = filtered.slice(0, target);
    }

    // Prepare context from results
    const context = filtered.map(({ doc, meta }) => {
      const tweetedAt = meta.tweetedAt || meta.timestamp || 'Unknown';
      const scrapedAt = meta.scrapedAt || 'Unknown';
      return `Tweet: ${doc}\nAuthor: @${meta.author}\nTweeted At: ${tweetedAt}\nScraped At: ${scrapedAt}\n`;
    }).join('\n');

    // Generate answer using RAG
    const ragPrompt = `Based on the following tweets and their analysis, answer the user's question:

Context:
${context}

User Question: ${query}

Provide a comprehensive answer based on the tweet data. Include relevant statistics and insights.`;

    if (!openai.chat || !openai.chat.completions || typeof openai.chat.completions.create !== 'function') {
      throw new Error('Configured OpenAI endpoint does not support chat.completions. Verify your base URL and provider.');
    }

    const response = await openai.chat.completions.create({
      model: model || 'gpt-4.1-mini',
      messages: [{ role: 'user', content: ragPrompt }],
      temperature: 0.7
    });

    const answerContent = response.choices && response.choices[0] && response.choices[0].message ? response.choices[0].message.content : '';
    const answer = answerContent || '';
    
    // Extract sources
    const sources = filtered.map(({ meta }) => {
      const snippet = (meta.text || '').substring(0, 100);
      const tweetedAt = meta.tweetedAt || meta.timestamp || 'unknown date';
      return `@${meta.author}: "${snippet}..." (tweeted ${tweetedAt})`;
    });

    res.json({
      success: true,
      answer,
      sources,
      totalResults: filtered.length
    });
  } catch (error) {
    const message = buildOpenAIErrorMessage(error);
    console.error('Error querying tweets:', message);
    res.status(500).json({ 
      success: false, 
      error: message 
    });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const count = await collection.count();
    res.json({ 
      success: true, 
      totalTweets: count 
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running',
    chromaConnected: !!collection
  });
});

// Start server
async function startServer() {
  try {
    await initializeCollection();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Make sure ChromaDB is running on http://localhost:8000');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
