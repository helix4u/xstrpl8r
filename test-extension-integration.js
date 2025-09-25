// Test script to simulate extension behavior
const SERVER_URL = 'http://localhost:3001';

async function testExtensionIntegration() {
  console.log('Testing extension integration...');
  
  try {
    // Simulate what the extension does when it finds tweets
    const testTweets = [
      {
        text: "This is a test tweet about AI and machine learning",
        timestamp: new Date().toISOString(),
        likes: 10,
        retweets: 5,
        replies: 2,
        user: {
          username: "testuser1",
          displayName: "Test User 1",
          followersCount: 1000,
          followingCount: 500,
          accountAge: 365
        }
      },
      {
        text: "I hate this stupid AI system",
        timestamp: new Date().toISOString(),
        likes: 2,
        retweets: 0,
        replies: 5,
        user: {
          username: "angryuser",
          displayName: "Angry User",
          followersCount: 50,
          followingCount: 2000,
          accountAge: 10
        }
      },
      {
        text: "Follow me for free crypto money!",
        timestamp: new Date().toISOString(),
        likes: 100,
        retweets: 50,
        replies: 10,
        user: {
          username: "cryptobot",
          displayName: "Crypto Bot",
          followersCount: 10000,
          followingCount: 100,
          accountAge: 5
        }
      }
    ];
    
    console.log('1. Storing test tweets...');
    for (let i = 0; i < testTweets.length; i++) {
      const tweet = testTweets[i];
      console.log(`Storing tweet ${i + 1}: @${tweet.user.username} - "${tweet.text}"`);
      
      const response = await fetch(`${SERVER_URL}/api/store-tweet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tweet: {
            text: tweet.text,
            timestamp: tweet.timestamp,
            likes: tweet.likes,
            retweets: tweet.retweets,
            replies: tweet.replies
          },
          userInfo: tweet.user
        })
      });
      
      const result = await response.json();
      console.log(`Result: ${result.success ? '✅' : '❌'} - ${result.message}`);
    }
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n2. Testing queries...');
    
    // Test query 1
    console.log('\nQuery 1: "AI"');
    const query1Response = await fetch(`${SERVER_URL}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: "AI"
      })
    });
    
    const query1Result = await query1Response.json();
    console.log(`Found ${query1Result.totalResults} results`);
    console.log('Answer:', query1Result.answer);
    
    // Test query 2
    console.log('\nQuery 2: "hate"');
    const query2Response = await fetch(`${SERVER_URL}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: "hate"
      })
    });
    
    const query2Result = await query2Response.json();
    console.log(`Found ${query2Result.totalResults} results`);
    console.log('Answer:', query2Result.answer);
    
    // Test query 3
    console.log('\nQuery 3: "crypto"');
    const query3Response = await fetch(`${SERVER_URL}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: "crypto"
      })
    });
    
    const query3Result = await query3Response.json();
    console.log(`Found ${query3Result.totalResults} results`);
    console.log('Answer:', query3Result.answer);
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testExtensionIntegration();
