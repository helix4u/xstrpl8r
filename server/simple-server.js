const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

let openai = null;
let openaiConfig = { apiKey: null, baseURL: null };
let tweets = []; // Simple in-memory storage for now

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

// Generate embeddings using OpenAI
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
      model: modelName || 'gpt-3.5-turbo',
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

// Store tweet in memory
app.post('/api/store-tweet', async (req, res) => {
  try {
    const { tweet, userInfo, apiKey, baseURL, model } = req.body;
    
    // Initialize OpenAI client with the latest configuration
    initializeOpenAI(apiKey, baseURL);

    // Generate embedding
    const embedding = await generateEmbedding(tweet.text);
    
    // Analyze tweet
    const analysis = await analyzeTweet(tweet.text, userInfo, model);
    
    // Store in memory
    const tweetData = {
      id: `tweet_${Date.now()}_${Math.random()}`,
      text: tweet.text,
      author: userInfo.username,
      displayName: userInfo.displayName,
      timestamp: tweet.timestamp,
      likes: tweet.likes,
      retweets: tweet.retweets,
      replies: tweet.replies,
      followers: userInfo.followersCount,
      following: userInfo.followingCount,
      accountAge: userInfo.accountAge,
      toxicity_score: analysis.toxicity_score,
      bot_likelihood: analysis.bot_likelihood,
      analysis: analysis.analysis,
      red_flags: analysis.red_flags,
      embedding: embedding
    };
    
    tweets.push(tweetData);

    res.json({ 
      success: true, 
      analysis,
      message: 'Tweet stored successfully' 
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

// Calculate cosine similarity between two vectors
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Query tweets using vector similarity search
app.post('/api/query', async (req, res) => {
  try {
    const { query, apiKey, baseURL, model } = req.body;
    
    initializeOpenAI(apiKey, baseURL);

    if (tweets.length === 0) {
      return res.json({
        success: true,
        answer: "No tweets have been analyzed yet. Please browse X.com to collect some tweets first.",
        sources: [],
        totalResults: 0
      });
    }

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    
    // Calculate similarity scores for all tweets
    const tweetsWithSimilarity = tweets.map(tweet => ({
      ...tweet,
      similarity: cosineSimilarity(queryEmbedding, tweet.embedding)
    }));
    
    // Sort by similarity (highest first), then by recency (most recent first)
    const sortedTweets = tweetsWithSimilarity
      .sort((a, b) => {
        // First sort by similarity (descending)
        if (Math.abs(a.similarity - b.similarity) > 0.01) {
          return b.similarity - a.similarity;
        }
        // If similarity is very close, sort by timestamp (descending - most recent first)
        return new Date(b.timestamp) - new Date(a.timestamp);
      })
      .slice(0, 10); // Get top 10 most similar tweets

    console.log(`Found ${sortedTweets.length} relevant tweets for query: "${query}"`);
    console.log(`Top similarity scores: ${sortedTweets.slice(0, 3).map(t => t.similarity.toFixed(3)).join(', ')}`);

    // Prepare context from results
    const context = sortedTweets.map((tweet, index) => {
      return `Tweet ${index + 1}: ${tweet.text}\nAuthor: @${tweet.author}\nToxicity: ${tweet.toxicity_score}/10\nBot Likelihood: ${tweet.bot_likelihood}/10\nSimilarity: ${(tweet.similarity * 100).toFixed(1)}%\nTimestamp: ${tweet.timestamp}\n`;
    }).join('\n');

    // Generate answer using RAG
    const ragPrompt = `Based on the following tweets and their analysis, answer the user's question. The tweets are ranked by semantic similarity to the query, with the most recent tweets preferred when similarity is close.

Context:
${context}

User Question: ${query}

Provide a comprehensive answer based on the tweet data. Include relevant statistics and insights. Focus on the most relevant and recent tweets.`;

    if (!openai.chat || !openai.chat.completions || typeof openai.chat.completions.create !== 'function') {
      throw new Error('Configured OpenAI endpoint does not support chat.completions. Verify your base URL and provider.');
    }

    const response = await openai.chat.completions.create({
      model: model || 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: ragPrompt }],
      temperature: 0.7
    });

    const answerContent = response.choices && response.choices[0] && response.choices[0].message ? response.choices[0].message.content : '';
    const answer = answerContent || '';
    
    // Extract sources with similarity scores
    const sources = sortedTweets.map(tweet => 
      `@${tweet.author}: "${tweet.text.substring(0, 100)}..." (${(tweet.similarity * 100).toFixed(1)}% similar)`
    );

    res.json({
      success: true,
      answer,
      sources,
      totalResults: sortedTweets.length
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
    res.json({ 
      success: true, 
      totalTweets: tweets.length 
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
    totalTweets: tweets.length
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Using simple in-memory storage (no ChromaDB required)');
});

module.exports = app;

