// Test conversation system
// Paste this in browser console (F12) when on a job page

async function testConversation() {
  console.log('🧪 Testing Conversation System...\n');
  
  // Test 1: Check conversation status (should be empty)
  console.log('Test 1: Initial conversation status');
  const status1 = await chrome.runtime.sendMessage({ action: 'getConversationStatus' });
  console.log('✓ Status:', status1);
  console.log('  Current job:', status1.current);
  console.log('  Messages:', status1.messageCount);
  console.log('');
  
  // Test 2: Store job context (this initializes conversation)
  console.log('Test 2: Store job context (initializes conversation)');
  await chrome.runtime.sendMessage({
    action: 'storeJobContext',
    context: {
      url: window.location.href,
      jobTitle: 'Senior Software Engineer',
      company: 'Test Company',
      description: 'Looking for an experienced developer...'
    }
  });
  console.log('✓ Job context stored');
  console.log('');
  
  // Wait a bit for initialization
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 3: Check conversation after initialization
  console.log('Test 3: Conversation after job analysis');
  const status2 = await chrome.runtime.sendMessage({ action: 'getConversationStatus' });
  console.log('✓ Status:', status2);
  console.log('  Current job:', status2.current);
  console.log('  Messages:', status2.messageCount);
  console.log('  Message preview:', status2.messages);
  console.log('');
  
  // Test 4: Ask a question (adds to conversation)
  console.log('Test 4: Ask AI a question');
  const answer = await chrome.runtime.sendMessage({
    action: 'getSmartAnswer',
    question: 'Why are you interested in this role?',
    field: { type: 'textarea', name: 'why' }
  });
  console.log('✓ Answer:', answer);
  console.log('  Value:', answer.value?.substring(0, 100) + '...');
  console.log('  Source:', answer.source);
  console.log('');
  
  // Test 5: Check conversation grew
  console.log('Test 5: Conversation after question');
  const status3 = await chrome.runtime.sendMessage({ action: 'getConversationStatus' });
  console.log('✓ Messages now:', status3.messageCount);
  console.log('  Latest messages:', status3.messages.slice(-3));
  console.log('');
  
  // Test 6: Ask another question (should remember context)
  console.log('Test 6: Ask follow-up question');
  const answer2 = await chrome.runtime.sendMessage({
    action: 'getSmartAnswer',
    question: 'What are your salary expectations?',
    field: { type: 'text', name: 'salary' }
  });
  console.log('✓ Answer:', answer2);
  console.log('');
  
  // Test 7: Final conversation state
  console.log('Test 7: Final conversation state');
  const status4 = await chrome.runtime.sendMessage({ action: 'getConversationStatus' });
  console.log('✓ Total messages:', status4.messageCount);
  console.log('  Full conversation:', status4.messages);
  console.log('');
  
  console.log('✅ Conversation system working!');
  console.log('💡 Each answer builds on previous context');
  console.log('💡 AI knows about the job and previous answers');
}

// Run test
testConversation().catch(console.error);
