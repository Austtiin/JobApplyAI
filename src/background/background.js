// Background service worker
// Manages state, communicates with Ollama, and coordinates between content scripts and popup

import { OllamaService } from './services/ollamaService.js';
import { StorageService } from './services/storageService.js';
import { ResumeParser } from './services/resumeParser.js';

console.log('JobApply AI background service worker loaded');

const ollamaService = new OllamaService();
const storageService = new StorageService();

// Conversation history per application session
let currentConversation = null;
let conversationHistory = []; // Array of {role, content}

// Restore any persisted conversation state when the service worker starts
(async () => {
  try {
    const savedConversation = await storageService.get('currentConversation');
    const savedHistory = await storageService.get('conversationHistory');
    if (savedConversation) {
      currentConversation = savedConversation;
    }
    if (Array.isArray(savedHistory) && savedHistory.length > 0) {
      conversationHistory = savedHistory;
    }
  } catch (e) {
    console.warn('Failed to restore conversation history from storage:', e);
  }
})();

/**
 * Log activity to feed
 */
async function logActivity(type, message) {
  const activity = {
    type: type,
    message: message,
    timestamp: new Date().toISOString()
  };
  
  // Get current feed
  const feed = await storageService.get('activityFeed') || [];
  
  // Add new activity at the beginning
  feed.unshift(activity);
  
  // Keep last 50 activities
  if (feed.length > 50) {
    feed.length = 50;
  }
  
  // Save to storage
  await storageService.set('activityFeed', feed);
  
  // Notify popup and content scripts
  try {
    // Best-effort notify popup; ignore if it's not open
    chrome.runtime.sendMessage({ action: 'updateActivity', activity }).catch(() => {});
  } catch (e) {
    // In case sendMessage isn't Promise-based in this environment
    console.warn('updateActivity message had no receiver (popup likely closed).');
  }
  
  // Also send to all tabs with content script
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'activityUpdate', activity }).catch(() => {});
    });
  });
  
  console.log(`[Activity] ${type}: ${message}`);
}

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('JobApply AI installed');
  
  // Set default settings
  await storageService.set('isActive', false);
  await storageService.set('stats', { formsDetected: 0, fieldsAutofilled: 0, pagesScanned: 0 });
  await storageService.set('applicationHistory', []);
  await storageService.set('activityFeed', []);
  await storageService.set('questionCache', []); // Store learned answers
  
  // Auto-load resume and parse profile information
  await loadResumeData();
  
  await logActivity('success', 'JobApply AI initialized successfully!');
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.action);
  
  if (message.action === 'analyzeForm') {
    handleFormAnalysis(message.data, sender.tab.id)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (message.action === 'getRecommendation') {
    getFieldRecommendation(message.fieldInfo)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (message.action === 'saveLearnedAnswer') {
    saveToQuestionCache(message.question, message.answer)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (message.action === 'getSmartAnswer') {
    getSmartAnswer(message.question, message.field)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (message.action === 'saveApplication') {
    saveApplicationRecord(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (message.action === 'learnFromInput') {
    learnFieldPattern(message.field, message.value, message.jobContext)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (message.action === 'generateWithAI') {
    generateFieldContent(message.field, message.jobContext)
      .then(content => sendResponse({ content }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (message.action === 'storeJobContext') {
    storeJobContext(message.context)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (message.action === 'markAsApplied') {
    markJobAsApplied(message.url)
      .then(async () => {
        await clearConversation(); // Clear conversation when application submitted
        sendResponse({ success: true });
      })
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (message.action === 'getConversationStatus') {
    sendResponse(getConversationSummary());
    return true;
  }
  
  if (message.action === 'incrementPagesScanned') {
    incrementPagesScanned()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

/**
 * Analyze form and get AI recommendations
 */
async function handleFormAnalysis(formData, tabId) {
  console.log('Analyzing form:', formData);
  
  await logActivity('scanning', `Analyzing form with ${formData.forms.reduce((sum, f) => sum + f.fields.length, 0)} fields`);
  
  // Update stats
  const stats = await storageService.get('stats') || { formsDetected: 0, fieldsAutofilled: 0 };
  stats.formsDetected++;
  await storageService.set('stats', stats);
  
  // Get user profile for context
  const userProfile = await storageService.get('userProfile');
  const learningData = await storageService.get('learningData') || [];
  const resumeData = await storageService.get('resumeData');
  
  await logActivity('analyzing', 'Checking learned patterns and user profile...');
  
  // Analyze each field with AI
  const recommendations = [];
  let knownFields = 0;
  let uncertainFields = 0;
  
  for (const form of formData.forms) {
    for (const field of form.fields) {
      try {
        // Check for resume upload fields
        if (field.type === 'file' && isResumeField(field)) {
          await logActivity('resume-detected', `Resume field detected: "${field.label}"`);
          recommendations.push({
            field: field,
            recommendation: {
              category: 'resume',
              suggestedValue: resumeData ? 'Resume ready to upload' : null,
              confidence: resumeData ? 'high' : 'low',
              reasoning: resumeData ? 'Resume available in storage' : 'No resume uploaded yet'
            }
          });
          if (resumeData) knownFields++;
          else uncertainFields++;
          continue;
        }
        
        // Check learned patterns first
        const learnedValue = findLearnedPattern(field, learningData);
        if (learnedValue) {
          await logActivity('success', `Using previous answer for "${field.label || field.name}"`);
          recommendations.push({
            field: field,
            recommendation: {
              category: 'learned',
              suggestedValue: learnedValue,
              confidence: 'high',
              reasoning: 'Based on your previous input'
            }
          });
          knownFields++;
          continue;
        }
        
        const recommendation = await analyzeField(field, userProfile, formData);
        recommendations.push({
          field: field,
          recommendation: recommendation
        });
        
        if (recommendation.confidence === 'high') {
          knownFields++;
        } else {
          uncertainFields++;
          await logActivity('uncertain', `Not sure about "${field.label || field.name}" - need your input`);
        }
      } catch (error) {
        console.error('Error analyzing field:', error);
        await logActivity('error', `Error analyzing field: ${error.message}`);
      }
    }
  }
  
  await logActivity('success', `Analysis complete: ${knownFields} known, ${uncertainFields} need attention`);
  
  // Send recommendations to content script
  try {
    chrome.tabs.sendMessage(tabId, {
      action: 'showRecommendations',
      recommendations: recommendations
    }).catch(() => {});
  } catch (e) {
    console.warn('Could not send showRecommendations to tab (no content script?)');
  }
  
  return { recommendations };
}

/**
 * Check if field is a resume upload field
 */
function isResumeField(field) {
  const label = (field.label + ' ' + field.name + ' ' + field.placeholder).toLowerCase();
  return label.includes('resume') || label.includes('cv') || label.includes('curriculum');
}

/**
 * Find learned pattern for field
 */
function findLearnedPattern(field, learningData) {
  const match = learningData.find(p => 
    (p.fieldLabel && field.label && p.fieldLabel.toLowerCase() === field.label.toLowerCase()) ||
    (p.fieldName && field.name && p.fieldName.toLowerCase() === field.name.toLowerCase())
  );
  
  return match ? match.value : null;
}

/**
 * Analyze a single field and determine the best action
 */
async function analyzeField(field, userProfile, context) {
  const prompt = buildFieldAnalysisPrompt(field, userProfile, context);
  
  try {
    const response = await ollamaService.generate(prompt, {
      model: 'llama3.2:3b', // Use a small, fast model
      temperature: 0.3 // Lower temperature for more deterministic responses
    });
    
    // Parse AI response
    const recommendation = parseAIResponse(response, field);
    return recommendation;
  } catch (error) {
    console.error('Ollama request failed:', error);
    // Fallback to rule-based approach
    return getRuleBasedRecommendation(field, userProfile);
  }
}

/**
 * Build prompt for field analysis
 */
function buildFieldAnalysisPrompt(field, userProfile, context) {
  const profile = userProfile || {};
  
  return `You are an AI assistant helping to fill out a job application form.

Field Information:
- Type: ${field.type}
- Label: ${field.label}
- Placeholder: ${field.placeholder}
- Name: ${field.name}
- Required: ${field.required}

User Profile:
- Name: ${profile.fullName || 'Not provided'}
- Email: ${profile.email || 'Not provided'}
- Phone: ${profile.phone || 'Not provided'}
- LinkedIn: ${profile.linkedin || 'Not provided'}

Page Context:
- URL: ${context.url}
- Title: ${context.title}

Task: Determine what this field is asking for and provide:
1. Field category (email, phone, name, linkedin, address, experience, etc.)
2. Suggested value from user profile if available
3. Confidence level (high/medium/low)

Respond in JSON format:
{
  "category": "field category",
  "suggestedValue": "value or null",
  "confidence": "high/medium/low",
  "reasoning": "brief explanation"
}`;
}

/**
 * Parse AI response
 */
function parseAIResponse(response, field) {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    }
  } catch (error) {
    console.error('Failed to parse AI response:', error);
  }
  
  return {
    category: 'unknown',
    suggestedValue: null,
    confidence: 'low',
    reasoning: 'Failed to parse AI response'
  };
}

/**
 * Get recommendation from user profile
 */
async function getFieldRecommendation(fieldInfo) {
  const userProfile = await storageService.get('userProfile');
  return getRuleBasedRecommendation(fieldInfo, userProfile);
}

/**
 * Rule-based fallback for field recommendations
 */
function getRuleBasedRecommendation(field, profile) {
  const label = (field.label + ' ' + field.placeholder + ' ' + field.name).toLowerCase();
  const profile_data = profile || {};
  
  // Email detection
  if (label.includes('email') || field.inputType === 'email') {
    return {
      category: 'email',
      suggestedValue: profile_data.email || null,
      confidence: profile_data.email ? 'high' : 'low',
      reasoning: 'Email field detected'
    };
  }
  
  // Phone detection
  if (label.includes('phone') || field.inputType === 'tel') {
    return {
      category: 'phone',
      suggestedValue: profile_data.phone || null,
      confidence: profile_data.phone ? 'high' : 'low',
      reasoning: 'Phone field detected'
    };
  }
  
  // Name detection
  if (label.includes('name') || label.includes('full name')) {
    return {
      category: 'name',
      suggestedValue: profile_data.fullName || null,
      confidence: profile_data.fullName ? 'high' : 'low',
      reasoning: 'Name field detected'
    };
  }
  
  // LinkedIn detection
  if (label.includes('linkedin') || label.includes('profile url')) {
    return {
      category: 'linkedin',
      suggestedValue: profile_data.linkedin || null,
      confidence: profile_data.linkedin ? 'high' : 'low',
      reasoning: 'LinkedIn field detected'
    };
  }
  
  return {
    category: 'unknown',
    suggestedValue: null,
    confidence: 'low',
    reasoning: 'Could not determine field type'
  };
}

/**
 * Save application record to history
 */
async function saveApplicationRecord(data) {
  const history = await storageService.get('applicationHistory') || [];
  
  history.unshift({
    position: data.position,
    company: data.company,
    url: data.url,
    date: new Date().toISOString()
  });
  
  // Keep last 100 applications
  if (history.length > 100) {
    history.length = 100;
  }
  
  await storageService.set('applicationHistory', history);
}

/**
 * Learn from user input for future reference
 */
async function learnFieldPattern(field, value, jobContext) {
  const learningData = await storageService.get('learningData') || [];
  
  const pattern = {
    fieldType: field.type,
    fieldLabel: field.label,
    fieldName: field.name,
    fieldPlaceholder: field.placeholder,
    value: value,
    jobType: jobContext?.jobType || '',
    timestamp: new Date().toISOString()
  };
  
  learningData.push(pattern);
  
  // Keep last 500 patterns
  if (learningData.length > 500) {
    learningData.shift();
  }
  
  await storageService.set('learningData', learningData);
  await logActivity('learned', `Stored your answer for "${field.label || field.name}"`);
  console.log('Learned new pattern:', pattern);
}

/**
 * Generate field content with AI
 */
async function generateFieldContent(field, jobContext) {
  const userProfile = await storageService.get('userProfile');
  const preferences = await storageService.get('userPreferences');
  const learningData = await storageService.get('learningData') || [];
  
  await logActivity('ai-generating', `Asking AI to write content for "${field.label || field.name}"...`);
  
  // Find similar past responses
  const similarPatterns = learningData.filter(p => 
    (p.fieldLabel && field.label && p.fieldLabel.toLowerCase().includes(field.label.toLowerCase())) ||
    (p.fieldName && field.name && p.fieldName.toLowerCase().includes(field.name.toLowerCase()))
  );
  
  const prompt = buildGenerationPrompt(field, jobContext, userProfile, preferences, similarPatterns);
  
  try {
    const content = await ollamaService.generate(prompt, {
      model: 'llama3.2:3b',
      temperature: 0.7,
      max_tokens: 500
    });
    
    await logActivity('ai-complete', `AI generated content for "${field.label || field.name}"`);
    return content.trim();
  } catch (error) {
    console.error('AI generation failed:', error);
    await logActivity('error', `AI failed: ${error.message}. Make sure Ollama is running.`);
    throw error;
  }
}

/**
 * Build prompt for AI content generation
 */
function buildGenerationPrompt(field, jobContext, userProfile, preferences, similarPatterns) {
  const profile = userProfile || {};
  const prefs = preferences || {};
  
  let prompt = `You are helping fill out a job application form. Generate appropriate content for the following field.

Job Information:
- Position: ${jobContext?.jobTitle || 'Unknown'}
- Company: ${jobContext?.company || 'Unknown'}
- Job Type: ${jobContext?.jobType || 'Unknown'}
- Description: ${jobContext?.description?.substring(0, 500) || 'Not available'}

Field to Fill:
- Label: ${field.label}
- Type: ${field.type}
- Placeholder: ${field.placeholder || 'none'}
- Name: ${field.name}

User Profile:
- Name: ${profile.fullName || 'Not provided'}
- Email: ${profile.email || 'Not provided'}
- Experience: ${profile.yearsExperience || 'Not provided'} years

User Preferences:
- Preferred Job Type: ${prefs.jobType || 'Full Time'}
- Preferred Location: ${prefs.location || 'Not specified'}
- Work Authorization: ${prefs.workAuthorization || 'Not specified'}
`;

  if (similarPatterns.length > 0) {
    prompt += `\nPrevious Similar Responses:\n`;
    similarPatterns.slice(-3).forEach((p, i) => {
      prompt += `${i + 1}. "${p.value}"\n`;
    });
  }
  
  prompt += `\nGenerate ONLY the content to fill in this field. Be concise and professional. Do not include quotes or explanations.`;
  
  return prompt;
}

/**
 * Store job context for current application
 */
async function storeJobContext(context) {
  await logActivity('job-found', `🎯 FOUND JOB: ${context.jobTitle} at ${context.company}`);
  
  // Analyze job fit using AI
  const jobFitScore = await analyzeJobFit(context);
  context.fitScore = jobFitScore;
  
  // Store current job context
  await storageService.set('currentJobContext', context);
  
  // Add to application history (not yet applied)
  const history = await storageService.get('applicationHistory') || [];
  const existingIndex = history.findIndex(h => h.url === context.url);
  
  if (existingIndex >= 0) {
    // Update existing record
    history[existingIndex] = {
      ...history[existingIndex],
      ...context,
      lastViewed: new Date().toISOString()
    };
  } else {
    // Add new record
    history.push({
      ...context,
      applied: false,
      appliedAt: null,
      lastViewed: new Date().toISOString()
    });
  }
  
  await storageService.set('applicationHistory', history);
  
  // Log fit score
  if (jobFitScore.score >= 80) {
    await logActivity('success', `✅ Excellent match! Confidence: ${jobFitScore.score}% - ${jobFitScore.reason}`);
  } else if (jobFitScore.score >= 60) {
    await logActivity('waiting', `⚠️ Good match. Confidence: ${jobFitScore.score}% - ${jobFitScore.reason}`);
  } else {
    await logActivity('uncertain', `❓ Uncertain fit. Confidence: ${jobFitScore.score}% - ${jobFitScore.reason}`);
  }
  
  console.log('Stored job context with fit score:', context.jobTitle, jobFitScore);
}

/**
 * Analyze job fit using AI
 */
async function analyzeJobFit(jobContext) {
  try {
    // Check if Ollama is available
    const isOllamaRunning = await ollamaService.isAvailable();
    if (!isOllamaRunning) {
      console.warn('Ollama is not available at 127.0.0.1:11434');
      await logActivity('error', '❌ Ollama not available - Make sure Ollama is running and llama3.2:3b is installed');
      return { score: 50, reason: 'Ollama not running. Install Ollama and run: ollama pull llama3.2:3b' };
    }
    
    // Initialize new conversation for this job application
    await initializeConversation(jobContext);
    
    const userProfile = await storageService.get('userProfile') || {};
    const preferences = await storageService.get('userPreferences') || {};
    const resumeData = await storageService.get('resumeData') || null;
    
    // Get resume text if available
    let resumeText = '';
    if (resumeData) {
      try {
        const textResponse = await fetch(chrome.runtime.getURL('resume/Resume_TXT_Extract.txt'));
        resumeText = await textResponse.text();
        resumeText = resumeText.substring(0, 2000); // First 2000 chars
      } catch (e) {
        console.warn('Could not load resume text:', e);
      }
    }
    
    // Build structured prompt with explicit scoring criteria
    const userMessage = `You are evaluating how well a candidate matches a specific job.

  MY RESUME (only use information that is actually present):
  ${resumeText || `Name: ${userProfile.fullName || 'Not specified'}
  Skills: ${userProfile.skills?.join(', ') || 'Not specified'}
  Experience: ${userProfile.yearsOfExperience || 'Not specified'} years
  Location: ${userProfile.location || 'Not specified'}`}

  JOB POSTING:
  Title: ${jobContext.jobTitle}
  Company: ${jobContext.company}
  Location: ${jobContext.location || 'Not specified'}
  Type: ${jobContext.jobType || 'Not specified'} | ${jobContext.workModel || 'Not specified'}
  Description:
  ${jobContext.description.substring(0, 2000)}

  SCORING INSTRUCTIONS (0-100):
  - Base the score mainly on overlap between my skills/experience and the job requirements.
  - 0-20 = almost no relevant skills or experience.
  - 21-40 = some limited overlap but mostly a stretch.
  - 41-60 = partial match; I meet some core requirements.
  - 61-80 = solid match; I meet most core requirements.
  - 81-100 = strong match; I clearly fit the role very well.
  - Do not give extremely low scores (below 20) unless there is almost no overlap.

  RETURN FORMAT (one line):
  SCORE: NN/100 - Short reason summarizing the main factors.`;

    await logActivity('analyzing', '🤖 Analyzing job fit with AI against your resume...');
    
    // Add user message to conversation
    addToConversation('user', userMessage);
    
    // Try to use deepseek-r1:8b for better reasoning, fallback to llama3.2:3b
    let modelToUse = 'llama3.2:3b';
    try {
      const models = await ollamaService.listModels();
      if (models.some(m => m.name?.includes('deepseek-r1'))) {
        modelToUse = 'deepseek-r1:8b';
      }
    } catch (e) {
      console.log('Using default model:', modelToUse);
    }
    
    // Use chat with conversation history
    const result = await ollamaService.chat(conversationHistory, {
      model: modelToUse,
      temperature: 0.3
    });
    
    // Add assistant response to conversation
    addToConversation('assistant', result);
    
    console.log(`AI Job Fit Analysis (${modelToUse}):`, result);
    
    // Parse response naturally - prefer explicit percentages or X/100, avoid the "0-100" scale phrase
    let score = 50;
    const cleaned = result.replace(/0\s*-\s*100/g, '');
    let matchValue = null;

    // 1) Look for "NN%"
    const percentMatch = cleaned.match(/(\d{1,3})\s*%/);
    if (percentMatch) {
      matchValue = parseInt(percentMatch[1], 10);
    } else {
      // 2) Look for "NN/100" or "NN out of 100"
      const outOfMatch = cleaned.match(/(\d{1,3})\s*\/\s*100/i) || cleaned.match(/(\d{1,3})\s*out of 100/i);
      if (outOfMatch) {
        matchValue = parseInt(outOfMatch[1], 10);
      } else {
        // 3) Fallback: first standalone number
        const genericMatch = cleaned.match(/(\d{1,3})/);
        if (genericMatch) {
          matchValue = parseInt(genericMatch[1], 10);
        }
      }
    }

    if (!Number.isNaN(matchValue) && matchValue !== null) {
      score = Math.min(100, Math.max(0, matchValue));
    }
    
    // Extract reason - everything after the number, or the whole response
    let reason = result.replace(/^\d+(?:%|\s*out of 100|\/100)?\s*[-:.]?\s*/i, '').trim();
    if (!reason || reason.length < 10) {
      reason = result.substring(0, 250);
    }
    reason = reason.substring(0, 250);
    
    // Log the result
    await logActivity('success', `📊 Job Fit: ${score}% confidence - ${reason.substring(0, 80)}...`);
    
    return { score, reason };
    
  } catch (error) {
    console.error('Job fit analysis error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Provide specific error message
    let errorMsg = `❌ Could not analyze job fit: ${error.message}`;
    if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
      errorMsg = '❌ Cannot connect to Ollama at 127.0.0.1:11434 - Check if Ollama is running';
    } else if (error.message.includes('model') || error.message.includes('not found')) {
      errorMsg = '❌ Model llama3.2:3b not found - Run: ollama pull llama3.2:3b';
    } else if (error.message.includes('CORS') || error.message.includes('Access-Control')) {
      errorMsg = '❌ CORS error - Check manifest.json host_permissions';
    }
    
    await logActivity('error', errorMsg);
    return { score: 50, reason: `Analysis unavailable: ${error.message}` };
  }
}

/**
 * Enhanced field recommendation with learning data
 */
async function getEnhancedRecommendation(field) {
  const userProfile = await storageService.get('userProfile');
  const learningData = await storageService.get('learningData') || [];
  
  // Check if we have learned this type of field before
  const learnedPattern = learningData.find(p => 
    (p.fieldLabel === field.label) || 
    (p.fieldName === field.name && p.fieldName)
  );
  
  if (learnedPattern) {
    return {
      category: 'learned',
      suggestedValue: learnedPattern.value,
      confidence: 0.9
    };
  }
  
  // Fallback to basic classification
  return classifyAndSuggest(field, userProfile);
}

/**
 * Load resume data from files
 */
async function loadResumeData() {
  try {
    // If user already has resume/profile/preferences stored, do not overwrite
    const existingResume = await storageService.get('resumeData');
    const existingProfile = await storageService.get('userProfile');
    const existingPreferences = await storageService.get('userPreferences');

    if (existingResume && existingProfile && existingPreferences) {
      console.log('Resume and profile already present in storage - skipping auto-load');
      await logActivity('success', 'Using existing resume and profile from storage');
      return;
    }

    // Load PDF resume
    const pdfResponse = await fetch(chrome.runtime.getURL('resume/AStephens_Resume_11142025_compressed.pdf'));
    const pdfBlob = await pdfResponse.blob();
    
    // Convert to base64
    const reader = new FileReader();
    const base64Promise = new Promise((resolve) => {
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(pdfBlob);
    });
    const base64Data = await base64Promise;
    
    // Store resume
    const resumeData = existingResume || {
      name: 'AStephens_Resume_11142025_compressed.pdf',
      type: 'application/pdf',
      data: base64Data,
      uploadedAt: new Date().toISOString()
    };
    if (!existingResume) {
      await storageService.set('resumeData', resumeData);
      await logActivity('success', 'Resume loaded and ready to use');
    }
    
    // Parse resume text to extract profile info
    const parsedProfile = await ResumeParser.loadAndParseResume('resume/Resume_TXT_Extract.txt');

    if (parsedProfile && !existingProfile) {
      // Store profile only if one doesn't already exist
      await storageService.set('userProfile', parsedProfile);
      await logActivity('success', `Profile auto-populated: ${parsedProfile.fullName}`);
    }

    if (!existingPreferences) {
      // Set default preferences with common job application fields only if none exist
      const baseProfile = existingProfile || parsedProfile || {};
      const preferences = {
        jobType: 'Full Time',
        location: baseProfile.location || 'Remote',
        workAuthorization: 'US Citizen',
        willingToRelocate: 'Yes',
        // Common application fields
        veteranStatus: 'Not a Veteran',
        disabilityStatus: 'No Disability',
        securityClearance: 'None',
        requiresSponsorship: 'No',
        noticePeriod: '2 weeks',
        salaryExpectation: '',
        availableStartDate: '',
        willingToTravel: 'Occasionally'
      };
      await storageService.set('userPreferences', preferences);
    }
  } catch (error) {
    console.error('Failed to load resume:', error);
    await logActivity('error', 'Failed to auto-load resume. You can upload manually in Dashboard.');
  }
}

/**
 * Mark job as applied
 */
async function markJobAsApplied(url) {
  const history = await storageService.get('applicationHistory') || [];
  const jobIndex = history.findIndex(h => h.url === url);
  
  if (jobIndex >= 0) {
    history[jobIndex].applied = true;
    history[jobIndex].appliedAt = new Date().toISOString();
    await storageService.set('applicationHistory', history);
    await logActivity('success', `✅ Marked as applied: ${history[jobIndex].jobTitle}`);
  }
}

/**
 * Increment pages scanned stat
 */
async function incrementPagesScanned() {
  const stats = await storageService.get('stats') || { formsDetected: 0, fieldsAutofilled: 0, pagesScanned: 0 };
  stats.pagesScanned = (stats.pagesScanned || 0) + 1;
  await storageService.set('stats', stats);
  console.log('Pages scanned:', stats.pagesScanned);
}

/**
 * Smart answer lookup with priority: Cache → Profile → Resume → AI
 */
async function getSmartAnswer(question, field) {
  console.log(`🧠 Smart lookup for: "${question}"`);
  
  // 1. Check question cache first
  const cachedAnswer = await checkQuestionCache(question);
  if (cachedAnswer) {
    await logActivity('success', `✓ Found cached answer for "${question}"`);
    return {
      value: cachedAnswer,
      source: 'cache',
      confidence: 'high'
    };
  }
  
  // 2. Check user profile for common fields
  const profileAnswer = await checkProfileForAnswer(question, field);
  if (profileAnswer) {
    await logActivity('success', `✓ Found answer in profile for "${question}"`);
    return {
      value: profileAnswer,
      source: 'profile',
      confidence: 'high'
    };
  }
  
  // 3. Check resume text
  const resumeAnswer = await checkResumeForAnswer(question, field);
  if (resumeAnswer) {
    await logActivity('success', `✓ Found answer in resume for "${question}"`);
    return {
      value: resumeAnswer,
      source: 'resume',
      confidence: 'medium'
    };
  }
  
  // 4. Ask AI as last resort
  await logActivity('analyzing', `🤖 Asking AI for: "${question}"`);
  const aiAnswer = await askAIForAnswer(question, field);
  return {
    value: aiAnswer,
    source: 'ai',
    confidence: 'medium'
  };
}

/**
 * Check question cache for previously answered questions
 */
async function checkQuestionCache(question) {
  const cache = await storageService.get('questionCache') || [];
  
  // Normalize question for matching
  const normalized = question.toLowerCase().trim();
  
  // Look for exact or similar matches
  const match = cache.find(item => {
    const cachedQ = item.question.toLowerCase().trim();
    return cachedQ === normalized || 
           cachedQ.includes(normalized) || 
           normalized.includes(cachedQ) ||
           calculateSimilarity(cachedQ, normalized) > 0.8;
  });
  
  return match ? match.answer : null;
}

/**
 * Check user profile for common field answers
 */
async function checkProfileForAnswer(question, field) {
  const profile = await storageService.get('userProfile') || {};
  const preferences = await storageService.get('userPreferences') || {};
  
  const normalized = question.toLowerCase();
  
  // Common field mappings
  const mappings = {
    'legal name': profile.fullName,
    'name': profile.fullName,
    'veteran': preferences.veteranStatus,
    'military': preferences.veteranStatus,
    'disability': preferences.disabilityStatus,
    'disabled': preferences.disabilityStatus,
    'security clearance': preferences.securityClearance,
    'clearance': preferences.securityClearance,
    'sponsorship': preferences.requiresSponsorship,
    'visa': preferences.requiresSponsorship,
    'work authorization': preferences.workAuthorization,
    'authorized to work': preferences.workAuthorization,
    'notice period': preferences.noticePeriod,
    'available to start': preferences.availableStartDate,
    'start date': preferences.availableStartDate,
    'relocate': preferences.willingToRelocate,
    'relocation': preferences.willingToRelocate,
    'travel': preferences.willingToTravel,
    'salary': preferences.salaryExpectation,
    'compensation': preferences.salaryExpectation,
    'first name': profile.firstName,
    'last name': profile.lastName,
    'full name': profile.fullName,
    'email': profile.email,
    'phone': profile.phone,
    'address': profile.location,
    'city': profile.location?.split(',')[0],
    'linkedin': profile.linkedIn
  };
  
  // Find matching field
  for (const [key, value] of Object.entries(mappings)) {
    if (normalized.includes(key) && value) {
      return value;
    }
  }
  
  return null;
}

/**
 * Check resume text for answer
 */
async function checkResumeForAnswer(question, field) {
  try {
    const textResponse = await fetch(chrome.runtime.getURL('resume/Resume_TXT_Extract.txt'));
    const resumeText = await textResponse.text();

    // For complex yes/no or choice questions, we now prefer letting the AI
    // reason over the full resume and job context instead of doing fragile
    // keyword matches here. Avoid guessing "Yes" just because a generic
    // word appears in the resume.
    if (field.type === 'radio' || field.type === 'checkbox') {
      return null;
    }

    // For now, we don't attempt to extract free-form answers directly from
    // the resume text. This hook is here for future, more targeted patterns.
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Ask AI for answer (last resort)
 */
async function askAIForAnswer(question, field) {
  try {
    // Load resume text
    let resumeText = '';
    try {
      const textResponse = await fetch(chrome.runtime.getURL('resume/Resume_TXT_Extract.txt'));
      resumeText = await textResponse.text();
    } catch (e) {
      console.warn('Could not load resume text:', e);
    }
    
    const profile = await storageService.get('userProfile') || {};
    const preferences = await storageService.get('userPreferences') || {};
    const jobContext = await storageService.get('currentJobContext') || {};

    // Build length guidance based on field metadata
    let lengthHint = 'Answer in 2-3 concise, professional sentences.';
    if (field.type === 'textarea') {
      lengthHint = 'Answer in 3-5 concise, specific sentences that sound like you wrote them.';
    }
    if (field.maxLength && field.maxLength > 0 && field.maxLength < 400) {
      lengthHint = `Keep the answer under ${field.maxLength} characters (1-2 short sentences).`;
    }

    // Detect boolean / checkbox-style questions
    const isBooleanField = field.type === 'checkbox' || field.type === 'radio';
    const isYesNoQuestion = /\byes\b|\bno\b|\bcheck this box\b|\bselect if\b/i.test(question);
    const booleanMode = isBooleanField || isYesNoQuestion;

    // Detect "key skills" / skills list questions
    const isSkillsQuestion = /key skills|skills and technologies|technical skills|core skills|relevant skills/i.test(question);

    // Format options, if present (for selects/radios)
    let optionsText = '';
    if (Array.isArray(field.options) && field.options.length > 0) {
      const optionList = field.options.map(opt => `${opt.text} [value="${opt.value}"]`).join(', ');
      optionsText = `OPTIONS: ${optionList}`;
    }

    // Summarize profile/preferences for the model
    const profileSummary = `Name: ${profile.fullName || ''}\n` +
      `Work authorization: ${preferences.workAuthorization || ''}\n` +
      `Veteran status: ${preferences.veteranStatus || ''}\n` +
      `Disability status: ${preferences.disabilityStatus || ''}\n` +
      `Security clearance: ${preferences.securityClearance || ''}\n` +
      `Requires sponsorship: ${preferences.requiresSponsorship || ''}`;

        const booleanInstructions = booleanMode
      ? `
BOOLEAN DECISION:
- First, decide if the correct answer is YES or NO for this person.
- Start your response with YES or NO in all caps, then a short explanation.
- If the checkbox should be left unchecked, clearly answer NO.
`
      : '';

        const skillsInstructions = isSkillsQuestion
      ? `
    SKILLS QUESTION:
    - Select 5-10 key skills or technologies from MY RESUME that are most relevant to the JOB.
    - Only use skills that actually appear in my resume; do not invent new ones.
    - Prefer skills and tools that are explicitly mentioned in the job description.
    - Return them as a single comma-separated list (no bullets, no extra sentences).
    `
      : '';

    const userMessage = `I'm filling out an online job application. Answer this question based on my profile, my resume, and the job I'm applying for.

JOB:
Title: ${jobContext.jobTitle || 'Unknown'}
Company: ${jobContext.company || 'Unknown'}
Description:
${(jobContext.description || '').substring(0, 1200)}

PROFILE:
${profileSummary}

MY RESUME (summary text):
${resumeText.substring(0, 2000)}

QUESTION: ${question}
FIELD TYPE: ${field.type}
${optionsText}

LENGTH / STYLE:
- ${lengthHint}
- Write in first person, as if you are me.
- Be specific and concrete, not generic.${booleanInstructions}${skillsInstructions}

Return ONLY the final answer text to paste into the field (no preamble like "Answer:" or "Explanation:").`;
    
    // Add to conversation
    addToConversation('user', userMessage);
    
    // Get response from chat
    const result = await ollamaService.chat(conversationHistory, {
      model: 'llama3.2:3b',
      temperature: 0.3
    });
    
    // Add response to conversation
    addToConversation('assistant', result);
    
    return result.trim();
  } catch (error) {
    console.error('AI answer failed:', error);
    return null;
  }
}

/**
 * Save answer to question cache
 */
async function saveToQuestionCache(question, answer) {
  const cache = await storageService.get('questionCache') || [];
  
  // Check if question already exists
  const existingIndex = cache.findIndex(item => 
    item.question.toLowerCase() === question.toLowerCase()
  );
  
  if (existingIndex >= 0) {
    // Update existing
    cache[existingIndex].answer = answer;
    cache[existingIndex].lastUsed = new Date().toISOString();
    cache[existingIndex].useCount = (cache[existingIndex].useCount || 1) + 1;
  } else {
    // Add new
    cache.push({
      question,
      answer,
      addedAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      useCount: 1
    });
  }
  
  // Keep last 100 questions
  if (cache.length > 100) {
    // Sort by last used and keep most recent
    cache.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
    cache.length = 100;
  }
  
  await storageService.set('questionCache', cache);
  await logActivity('success', `✓ Learned answer for: "${question}"`);
}

/**
 * Calculate string similarity (0-1)
 */
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Levenshtein distance for string similarity
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Extract keywords from question
 */
function extractKeywords(question) {
  const words = question.toLowerCase().split(/\s+/);
  const stopWords = ['the', 'a', 'an', 'are', 'is', 'do', 'does', 'you', 'have', 'has'];
  return words.filter(w => w.length > 3 && !stopWords.includes(w));
}

/**
 * Initialize conversation for a new job application
 */
async function initializeConversation(jobContext) {
  currentConversation = {
    jobTitle: jobContext.jobTitle,
    company: jobContext.company,
    startedAt: new Date().toISOString(),
    url: jobContext.url
  };
  
  // Reset conversation history with system prompt
  conversationHistory = [
    {
      role: 'system',
      content: `You are a helpful assistant helping a job candidate fill out application forms. You have access to their resume and should provide honest, professional answers based on their experience. Keep responses concise and relevant to the questions asked. You're currently helping with an application for ${jobContext.jobTitle} at ${jobContext.company}.`
    }
  ];
  
  console.log('💬 Started new conversation for:', jobContext.jobTitle);
  await logActivity('analyzing', `💬 Started AI conversation for ${jobContext.jobTitle}`);

  // Persist conversation state
  await storageService.set('currentConversation', currentConversation);
  await storageService.set('conversationHistory', conversationHistory);
}

/**
 * Add message to conversation history
 */
function addToConversation(role, content) {
  conversationHistory.push({ role, content });
  
  // Keep only last 20 messages to avoid context overflow
  if (conversationHistory.length > 21) { // 1 system + 20 messages
    conversationHistory = [
      conversationHistory[0], // Keep system message
      ...conversationHistory.slice(-20) // Keep last 20
    ];
  }
  
  console.log(`💬 Added ${role} message to conversation (${conversationHistory.length} total)`);

  // Persist updated history
  storageService.set('conversationHistory', conversationHistory).catch(() => {});
}

/**
 * Clear conversation (called when application is submitted)
 */
async function clearConversation() {
  if (currentConversation) {
    console.log('💬 Clearing conversation for:', currentConversation.jobTitle);
    await logActivity('success', `✅ Completed application conversation`);
  }
  
  currentConversation = null;
  conversationHistory = [];

   // Clear persisted conversation state
  await storageService.set('currentConversation', null);
  await storageService.set('conversationHistory', []);
}

/**
 * Get conversation summary for debugging
 */
function getConversationSummary() {
  return {
    current: currentConversation,
    messageCount: conversationHistory.length,
    messages: conversationHistory.map(m => ({
      role: m.role,
      content: m.content
    }))
  };
}
