// Test the smart caching system
// Run this in browser console after loading extension

async function testSmartCache() {
  console.log('🧪 Testing Smart Cache System...\n');
  
  // Test 1: Profile field
  console.log('Test 1: Profile field (veteran status)');
  const test1 = await chrome.runtime.sendMessage({
    action: 'getSmartAnswer',
    question: 'Are you a veteran?',
    field: { type: 'radio', name: 'veteran' }
  });
  console.log('✓ Result:', test1);
  console.log('  Expected source: profile');
  console.log('  Actual source:', test1.source);
  console.log('');
  
  // Test 2: Save to cache
  console.log('Test 2: Save custom answer to cache');
  await chrome.runtime.sendMessage({
    action: 'saveLearnedAnswer',
    question: 'What is your biggest strength?',
    answer: 'Problem-solving and technical leadership'
  });
  console.log('✓ Saved to cache');
  console.log('');
  
  // Test 3: Retrieve from cache
  console.log('Test 3: Retrieve from cache');
  const test3 = await chrome.runtime.sendMessage({
    action: 'getSmartAnswer',
    question: 'What is your biggest strength?',
    field: { type: 'textarea', name: 'strength' }
  });
  console.log('✓ Result:', test3);
  console.log('  Expected source: cache');
  console.log('  Actual source:', test3.source);
  console.log('  Value:', test3.value);
  console.log('');
  
  // Test 4: Similar question matching
  console.log('Test 4: Similar question matching');
  const test4 = await chrome.runtime.sendMessage({
    action: 'getSmartAnswer',
    question: 'What would you say is your biggest strength?',
    field: { type: 'textarea', name: 'strength2' }
  });
  console.log('✓ Result:', test4);
  console.log('  Should match previous question');
  console.log('  Source:', test4.source);
  console.log('  Value:', test4.value);
  console.log('');
  
  // Test 5: Check profile data
  console.log('Test 5: View stored profile');
  const profile = await chrome.storage.local.get('userProfile');
  console.log('✓ Profile:', profile.userProfile);
  console.log('');
  
  const preferences = await chrome.storage.local.get('userPreferences');
  console.log('✓ Preferences:', preferences.userPreferences);
  console.log('');
  
  // Test 6: View question cache
  console.log('Test 6: View question cache');
  const cache = await chrome.storage.local.get('questionCache');
  console.log('✓ Cached questions:', cache.questionCache);
  console.log('');
  
  console.log('✅ All tests complete!');
}

// Run tests
testSmartCache().catch(console.error);


