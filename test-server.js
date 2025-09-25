// Test script to verify the server is working
const SERVER_URL = 'http://localhost:3001';

async function testServer() {
  console.log('Testing X.com AI Analyzer server...');
  
  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${SERVER_URL}/api/health`);
    const healthData = await healthResponse.json();
    console.log('Health check:', healthData);
    
    if (!healthData.success) {
      throw new Error('Server health check failed');
    }
    
    // Test stats endpoint
    console.log('2. Testing stats endpoint...');
    const statsResponse = await fetch(`${SERVER_URL}/api/stats`);
    const statsData = await statsResponse.json();
    console.log('Stats:', statsData);
    
    console.log('✅ Server is working correctly!');
    console.log('You can now use the Chrome extension.');
    
  } catch (error) {
    console.error('❌ Server test failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure ChromaDB is running: chroma run --host localhost --port 8000');
    console.log('2. Make sure the server is running: cd server && npm start');
    console.log('3. Check that both services are running on the correct ports');
  }
}

testServer();
