const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

let tweets = []; // Simple in-memory storage

// Mock analysis function for demo
function mockAnalyzeTweet(tweetText, userInfo) {
  // Simple mock analysis based on keywords
  const toxicKeywords = ['hate', 'stupid', 'idiot', 'kill', 'die', 'fuck', 'shit'];
  const botKeywords = ['follow me', 'click here', 'free money', 'crypto', 'bitcoin'];
  
  let toxicity_score = 0;
  let bot_likelihood = 0;
  const red_flags = [];
  
  const text = tweetText.toLowerCase();
  
  // Check for toxic content
  toxicKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      toxicity_score += 2;
      red_flags.push(`Contains toxic keyword: ${keyword}`);
    }
  });
  
  // Check for bot-like content
  botKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      bot_likelihood += 3;
      red_flags.push(`Bot-like keyword: ${keyword}`);
    }
  });
  
  // Check account patterns
  if (userInfo.followersCount > userInfo.followingCount * 10) {
    bot_likelihood += 2;
    red_flags.push('High follower/following ratio');
  }
  
  if (userInfo.accountAge < 30) {
    bot_likelihood += 1;
    red_flags.push('New account');
  }
  
  // Cap scores at 10
  toxicity_score = Math.min(toxicity_score, 10);
  bot_likelihood = Math.min(bot_likelihood, 10);
  
  return {
    toxicity_score,
    bot_likelihood,
    analysis: `Mock analysis: ${toxicity_score > 5 ? 'High toxicity detected' : 'Low toxicity'}, ${bot_likelihood > 5 ? 'High bot likelihood' : 'Low bot likelihood'}`,
    red_flags
  };
}

// Store tweet in memory
app.post('/api/store-tweet', async (req, res) => {
  try {
    console.log('Received tweet analysis request:', JSON.stringify(req.body, null, 2));
    
    const { tweet, userInfo, options } = req.body;

    const shouldAnalyze = options && Object.prototype.hasOwnProperty.call(options, 'analyze')
      ? Boolean(options.analyze)
      : true;
    const shouldStore = options && Object.prototype.hasOwnProperty.call(options, 'store')
      ? Boolean(options.store)
      : true;

    if (!tweet || !userInfo) {
      console.error('Missing tweet or userInfo in request');
      return res.status(400).json({ 
        success: false, 
        error: 'Missing tweet or userInfo data' 
      });
    }

    if (!shouldAnalyze && !shouldStore) {
      return res.json({
        success: true,
        analysis: null,
        stored: false,
        message: 'No processing requested (demo mode).'
      });
    }

    // Mock analysis
    const analysis = shouldAnalyze ? mockAnalyzeTweet(tweet.text, userInfo) : null;

    // Store in memory
    let stored = false;
    if (shouldStore) {
      const analysisForStorage = analysis || {
        toxicity_score: 0,
        bot_likelihood: 0,
        analysis: shouldAnalyze ? 'Analysis unavailable.' : 'Analysis skipped (disabled).',
        red_flags: []
      };

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
        toxicity_score: analysisForStorage.toxicity_score,
        bot_likelihood: analysisForStorage.bot_likelihood,
        analysis: analysisForStorage.analysis,
        red_flags: analysisForStorage.red_flags
      };

      tweets.push(tweetData);
      stored = true;

      if (shouldAnalyze) {
        console.log(`✅ Stored tweet #${tweets.length}: @${userInfo.username} - "${tweet.text.substring(0, 50)}..." - Toxicity: ${analysisForStorage.toxicity_score}/10, Bot: ${analysisForStorage.bot_likelihood}/10`);
      } else {
        console.log(`✅ Stored tweet #${tweets.length}: @${userInfo.username} (analysis skipped)`);
      }
    }

    const message = shouldStore
      ? shouldAnalyze
        ? 'Tweet analyzed and stored successfully (demo mode).'
        : 'Tweet stored successfully without analysis (demo mode).'
      : 'Tweet analyzed successfully (demo mode).';

    res.json({ 
      success: true, 
      analysis: shouldAnalyze ? analysis : null,
      stored,
      message 
    });
  } catch (error) {
    console.error('❌ Error storing tweet:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Query tweets using simple text search
app.post('/api/query', async (req, res) => {
  try {
    console.log('Received query request:', JSON.stringify(req.body, null, 2));
    console.log(`Total tweets in memory: ${tweets.length}`);
    
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing query parameter' 
      });
    }
    
    // Simple text search
    const relevantTweets = tweets.filter(tweet => 
      tweet.text.toLowerCase().includes(query.toLowerCase()) ||
      tweet.author.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10);

    console.log(`Found ${relevantTweets.length} relevant tweets for query: "${query}"`);

    // Generate mock answer
    const answer = `Based on ${relevantTweets.length} relevant tweets found:

${relevantTweets.map(tweet => 
  `@${tweet.author}: "${tweet.text.substring(0, 100)}..." (Toxicity: ${tweet.toxicity_score}/10, Bot: ${tweet.bot_likelihood}/10)`
).join('\n\n')}

This is a demo response. For real AI analysis, configure your API credentials.`;

    // Extract sources
    const sources = relevantTweets.map(tweet => 
      `@${tweet.author}: "${tweet.text.substring(0, 100)}..."`
    );

    res.json({
      success: true,
      answer,
      sources,
      totalResults: relevantTweets.length
    });
  } catch (error) {
    console.error('Error querying tweets:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
    message: 'Demo server is running',
    totalTweets: tweets.length,
    mode: 'demo'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Demo server running on http://localhost:${PORT}`);
  console.log('This is a demo mode - no API credentials required');
  console.log('Tweets will be analyzed using simple keyword matching');
});

module.exports = app;
