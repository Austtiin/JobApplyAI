// Test Ollama connection from extension background
// Open Chrome DevTools for the service worker and paste this

async function testOllamaConnection() {
  console.log('🧪 Testing Ollama connection from extension...\n');
  
  const baseUrl = 'http://127.0.0.1:11434';
  
  // Test 1: Check if Ollama is reachable
  console.log('Test 1: Checking if Ollama is running...');
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Ollama is running!');
      console.log('Available models:', data.models?.map(m => m.name));
    } else {
      console.error('❌ Ollama responded with error:', response.status);
    }
  } catch (error) {
    console.error('❌ Cannot connect to Ollama:', error.message);
    return;
  }
  
  // Test 2: Try generate request
  console.log('\nTest 2: Testing generate API...');
  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3.2:3b',
        prompt: 'Say hello in one sentence',
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 50
        }
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Generate API works!');
      console.log('Response:', data.response);
      console.log('Stats:', {
        model: data.model,
        total_duration: (data.total_duration / 1000000000).toFixed(2) + 's',
        eval_count: data.eval_count
      });
    } else {
      const errorText = await response.text();
      console.error('❌ Generate API failed:', response.status, errorText);
    }
  } catch (error) {
    console.error('❌ Generate request failed:', error.message);
  }
  
  console.log('\n✅ Test complete!');
}

// Run the test
testOllamaConnection();
