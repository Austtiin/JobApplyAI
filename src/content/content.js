// Content script - runs on job application pages
// Plain JavaScript for performance

console.log('JobApply AI content script loaded');

let isActive = false;
let activeOverlays = new Map();
let jobContext = null;
let pageState = 'viewing'; // 'viewing', 'applying', 'submitted'
let hasScannedForms = false;

// On page load, only activate behavior if extension is enabled
window.addEventListener('load', () => {
  chrome.storage.local.get(['isActive'], (result) => {
    isActive = !!result.isActive;

    if (!isActive) {
      console.log('JobApply AI is disabled - content script idle on this page');
      return;
    }

    // Create floating panel to show activity
    createFloatingPanel();
    
    // Increment pages scanned stat
    chrome.runtime.sendMessage({ action: 'incrementPagesScanned' });
    
    // Determine page type
    const isApplicationPage = detectIfApplicationPage();
    
    if (isApplicationPage) {
      console.log('📝 Detected APPLICATION page - ready to scan forms');
      pageState = 'applying';
      
      // Scan forms immediately on application pages
      setTimeout(() => {
        if (!hasScannedForms) {
          scanAndAnalyzeForms();
          hasScannedForms = true;
        }
      }, 1000);
    } else {
      console.log('👁️ Detected JOB VIEWING page - waiting for Apply click');
      pageState = 'viewing';
    }
    
    // Extract job info
    setTimeout(() => {
      jobContext = extractJobContext();
      if (jobContext) {
        console.log('Job detected:', jobContext.jobTitle);
        chrome.runtime.sendMessage({ action: 'storeJobContext', context: jobContext });
        
        // Update floating panel with job info
        const activityList = document.getElementById('floating-activity-list');
        if (activityList) {
          activityList.innerHTML = '';
          addActivityToPanel({
            type: 'job-found',
            message: `🎯 FOUND: ${jobContext.jobTitle} at ${jobContext.company || 'Unknown Company'}`
          });
        }
      } else {
        // Try again after 2 seconds for dynamic content
        setTimeout(() => {
          jobContext = extractJobContext();
          if (jobContext) {
            console.log('Job detected (delayed):', jobContext.jobTitle);
            chrome.runtime.sendMessage({ action: 'storeJobContext', context: jobContext });
          } else {
            // Update panel with "no job found" message
            const activityList = document.getElementById('floating-activity-list');
            if (activityList) {
              activityList.innerHTML = '<div class="activity-item">ℹ️ No job posting detected on this page. Visit a job application page to start!</div>';
            }
          }
        }, 2000);
      }
    }, 500); // Small delay to let page render
    
    // Detect Apply Now button
    setTimeout(detectApplyButton, 1000);
    
    // Detect and handle skip buttons on autofill pages
    setTimeout(detectAndHandleSkipButtons, 1500);
  });
});

/**
 * Scan for forms and analyze them automatically
 */
function scanAndAnalyzeForms() {
  if (!isActive) {
    console.log('JobApply AI is disabled - skipping automatic form scan');
    return;
  }

  const formData = scanForForms();
  
  if (formData.forms.length > 0) {
    console.log(`Found ${formData.forms.length} form(s) - analyzing...`);
    
    addActivityToPanel({
      type: 'scanning',
      message: `🔍 Found ${formData.forms.length} form(s) - analyzing...`
    });
    
    // Send to background for AI analysis
    chrome.runtime.sendMessage({
      action: 'analyzeForm',
      data: formData
    });
    
    // Start monitoring for submit buttons
    detectSubmitButtons();
  }
}

// State from storage is now initialized in the load handler above

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleExtension') {
    isActive = message.isActive;
    if (isActive) {
      initializeScanner();
    } else {
      cleanupScanner();
    }
  }
  
  if (message.action === 'scanPage') {
    const formData = scanForForms();
    sendResponse(formData);
  }
  
  if (message.action === 'fillField') {
    fillFormField(message.selector, message.value);
  }
  
  if (message.action === 'showRecommendations') {
    console.log('Showing recommendations:', message.recommendations);
    showFieldRecommendations(message.recommendations);
    
    // Update activity panel
    addActivityToPanel({
      type: 'success',
      message: `✅ Found ${message.recommendations.length} fields - showing suggestions`
    });
  }
  
  if (message.action === 'showNotification') {
    showNotification(message.text, message.type);
  }
  
  if (message.action === 'activityUpdate' && floatingPanel) {
    addActivityToPanel(message.activity);
  }
  
  return true; // Keep channel open for async responses
});

/**
 * Initialize the form scanner
 */
function initializeScanner() {
  console.log('JobApply AI scanner initialized');
  
  // Create floating panel
  createFloatingPanel();
  
  // Extract job context if not already done
  if (!jobContext) {
    jobContext = extractJobContext();
    if (jobContext) {
      showNotification('Job information extracted', 'success');
      chrome.runtime.sendMessage({ action: 'storeJobContext', context: jobContext });
    }
  }
  
  // Scan for forms on page load
  const formData = scanForForms();
  
  if (formData.forms.length > 0) {
    console.log(`Found ${formData.forms.length} form(s) on page`);
    
    // Send form data to background script for AI analysis
    chrome.runtime.sendMessage({
      action: 'analyzeForm',
      data: formData
    });
  }
  
  // Watch for dynamically added forms
  observeDOMChanges();
}

/**
 * Scan the page for job application forms
 */
function scanForForms() {
  const forms = document.querySelectorAll('form');
  const formData = {
    url: window.location.href,
    title: document.title,
    forms: []
  };
  
  forms.forEach((form, formIndex) => {
    // Skip search forms and other non-application forms
    if (isIrrelevantForm(form)) {
      console.log('Skipping irrelevant form:', form.action || form.id);
      return;
    }
    
    const fields = [];
    
    // Text inputs, emails, phone, etc.
    const inputs = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"])');
    inputs.forEach((input, index) => {
      fields.push(extractFieldInfo(input, 'input', formIndex, index));
    });
    
    // Textareas
    const textareas = form.querySelectorAll('textarea');
    textareas.forEach((textarea, index) => {
      fields.push(extractFieldInfo(textarea, 'textarea', formIndex, index));
    });
    
    // Selects/dropdowns
    const selects = form.querySelectorAll('select');
    selects.forEach((select, index) => {
      fields.push(extractFieldInfo(select, 'select', formIndex, index));
    });
    
    // Radio buttons
    const radioGroups = getRadioGroups(form);
    radioGroups.forEach((group, index) => {
      fields.push(extractRadioGroupInfo(group, formIndex, index));
    });
    
    // File inputs (resume, etc.)
    const fileInputs = form.querySelectorAll('input[type="file"]');
    fileInputs.forEach((input, index) => {
      fields.push(extractFieldInfo(input, 'file', formIndex, index));
    });
    
    formData.forms.push({
      action: form.action,
      method: form.method,
      fields: fields
    });
  });
  
  return formData;
}

/**
 * Extract field information
 */
function extractFieldInfo(element, type, formIndex, fieldIndex) {
  const label = findLabel(element);
  const placeholder = element.placeholder || '';
  const name = element.name || '';
  const id = element.id || '';
  const maxLength = typeof element.maxLength === 'number' && element.maxLength > 0 ? element.maxLength : null;
  
  return {
    type: type,
    selector: generateSelector(element),
    label: label,
    placeholder: placeholder,
    name: name,
    id: id,
    required: element.required || element.hasAttribute('required'),
    value: element.value,
    inputType: element.type || '',
    maxLength: maxLength,
    options: type === 'select' ? getSelectOptions(element) : []
  };
}

/**
 * Extract radio group information
 */
function extractRadioGroupInfo(group, formIndex, groupIndex) {
  const firstRadio = group[0];
  const label = findLabel(firstRadio);
  
  return {
    type: 'radio',
    name: firstRadio.name,
    label: label,
    required: firstRadio.required,
    options: group.map(radio => ({
      value: radio.value,
      label: findLabel(radio) || radio.value,
      selector: generateSelector(radio)
    }))
  };
}

/**
 * Get radio button groups
 */
function getRadioGroups(form) {
  const radios = form.querySelectorAll('input[type="radio"]');
  const groups = {};
  
  radios.forEach(radio => {
    const name = radio.name;
    if (!groups[name]) {
      groups[name] = [];
    }
    groups[name].push(radio);
  });
  
  return Object.values(groups);
}

/**
 * Get select options
 */
function getSelectOptions(select) {
  return Array.from(select.options).map(opt => ({
    value: opt.value,
    text: opt.text
  }));
}

/**
 * Find associated label for an input
 */
function findLabel(element) {
  // Check for label with 'for' attribute
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent.trim();
  }
  
  // Check for parent label
  const parentLabel = element.closest('label');
  if (parentLabel) {
    return parentLabel.textContent.trim();
  }
  
  // Check for nearby label (sibling)
  const prevSibling = element.previousElementSibling;
  if (prevSibling && prevSibling.tagName === 'LABEL') {
    return prevSibling.textContent.trim();
  }
  
  // Check aria-label
  if (element.hasAttribute('aria-label')) {
    return element.getAttribute('aria-label');
  }
  
  return '';
}

/**
 * Generate a unique selector for an element
 */
function generateSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }
  
  if (element.name) {
    return `[name="${element.name}"]`;
  }
  
  // Generate a more complex selector
  let path = [];
  let current = element;
  
  while (current && current.tagName !== 'BODY') {
    let selector = current.tagName.toLowerCase();
    
    if (current.className) {
      selector += '.' + current.className.split(' ').join('.');
    }
    
    path.unshift(selector);
    current = current.parentElement;
    
    if (path.length > 5) break; // Limit depth
  }
  
  return path.join(' > ');
}

/**
 * Fill a form field with value
 */
function fillFormField(selector, value) {
  const element = document.querySelector(selector);
  
  if (!element) {
    console.error(`Element not found: ${selector}`);
    return;
  }
  
  // Handle different input types
  if (element.tagName === 'INPUT') {
    if (element.type === 'radio' || element.type === 'checkbox') {
      element.checked = true;
    } else {
      element.value = value;
    }
  } else if (element.tagName === 'SELECT') {
    element.value = value;
  } else if (element.tagName === 'TEXTAREA') {
    element.value = value;
  }
  
  // Trigger change event
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  
  console.log(`Filled field: ${selector} = ${value}`);
}

/**
 * Watch for DOM changes
 */
function observeDOMChanges() {
  const observer = new MutationObserver((mutations) => {
    // Check if new forms were added
    const hasNewForms = mutations.some(mutation => 
      Array.from(mutation.addedNodes).some(node => 
        node.tagName === 'FORM' || (node.querySelectorAll && node.querySelectorAll('form').length > 0)
      )
    );
    
    if (hasNewForms) {
      console.log('New form detected');
      const formData = scanForForms();
      chrome.runtime.sendMessage({
        action: 'analyzeForm',
        data: formData
      });
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Check if form is irrelevant (search, feedback, etc.)
 */
function isIrrelevantForm(form) {
  const action = (form.action || '').toLowerCase();
  const id = (form.id || '').toLowerCase();
  const className = (form.className || '').toLowerCase();
  const text = (form.innerText || '').toLowerCase();
  
  // Skip search forms
  const searchPatterns = ['search', 'query', 'feedback', 'subscribe', 'newsletter', 'filter'];
  if (searchPatterns.some(pattern => 
    action.includes(pattern) || id.includes(pattern) || className.includes(pattern)
  )) {
    return true;
  }
  
  // Skip if form has only 1-2 inputs (likely search boxes)
  const inputs = form.querySelectorAll('input:not([type="hidden"]), textarea');
  if (inputs.length < 3) {
    return true;
  }

   // Skip account/login/signup forms (we don't want to touch passwords/accounts)
  const hasPasswordInput = form.querySelector('input[type="password"]');
  const accountPatterns = [
    'sign in', 'sign-in', 'signin',
    'sign up', 'sign-up', 'signup',
    'log in', 'login',
    'register', 'registration',
    'create account', 'new account',
    'password', 'new password', 'confirm password'
  ];
  if (hasPasswordInput || accountPatterns.some(pattern => text.includes(pattern))) {
    return true;
  }
  
  return false;
}

/**
 * Check if field is irrelevant
 */
function isIrrelevantField(field) {
  const label = (field.label || '').toLowerCase();
  const name = (field.name || '').toLowerCase();
  const placeholder = (field.placeholder || '').toLowerCase();
  const id = (field.id || '').toLowerCase();
  const inputType = (field.inputType || '').toLowerCase();

  // Never touch password / auth-related fields
  if (inputType === 'password') {
    return true;
  }
  const authPatterns = [
    'password', 'passcode', 'pin', 'otp',
    'verification code', 'one-time code', '2fa',
    'security question', 'security answer',
    'username', 'user name', 'login', 'log in', 'sign in', 'sign-in',
    'sign up', 'sign-up', 'signup', 'register', 'registration', 'account'
  ];
  if (authPatterns.some(pattern =>
    label.includes(pattern) || name.includes(pattern) || placeholder.includes(pattern) || id.includes(pattern)
  )) {
    return true;
  }
  
  const irrelevantPatterns = [
    'search', 'query', 'filter', 'feedback', 
    'subscribe', 'newsletter', 'captcha',
    'coupon', 'promo', 'discount'
  ];
  
  return irrelevantPatterns.some(pattern =>
    label.includes(pattern) || name.includes(pattern) || placeholder.includes(pattern)
  );
}

/**
 * Choose the best matching option for a select based on an answer string
 */
function chooseBestSelectOption(options, answer) {
  if (!answer) return null;
  const answerText = String(answer).toLowerCase().trim();
  if (!answerText) return null;

  // Exact or contains match on option text
  for (const opt of options) {
    const optText = (opt.text || '').toLowerCase().trim();
    if (!optText) continue;
    if (optText === answerText || answerText === optText) {
      return opt;
    }
  }

  // Partial match (answer includes option text or vice versa)
  for (const opt of options) {
    const optText = (opt.text || '').toLowerCase().trim();
    if (!optText) continue;
    if (answerText.includes(optText) || optText.includes(answerText)) {
      return opt;
    }
  }

  // Heuristics for common questions like "How did you hear about us?"
  if (answerText.includes('job board')) {
    const jobBoardOpt = options.find(opt => (opt.text || '').toLowerCase().includes('job board'));
    if (jobBoardOpt) return jobBoardOpt;
  }
  if (answerText.includes('other')) {
    const otherOpt = options.find(opt => (opt.text || '').toLowerCase().includes('other'));
    if (otherOpt) return otherOpt;
  }

  return null;
}

/**
 * Interpret a natural-language AI answer as a checkbox decision
 */
function shouldCheckCheckbox(answer) {
  if (!answer) return null;
  const text = String(answer).toLowerCase().trim();
  if (!text) return null;
  if (text.startsWith('yes') || text.startsWith('yep') || text.startsWith('true') || text.startsWith('check')) {
    return true;
  }
  if (text.startsWith('no') || text.startsWith('nope') || text.startsWith("don't") || text.startsWith('do not') || text.startsWith('false') || text.startsWith('leave')) {
    return false;
  }
  return null;
}

/**
 * Handle smart selection for yes/no or choice radio groups
 */
function handleRadioRecommendation(rec) {
  const field = rec.field;
  const options = Array.isArray(field.options) ? field.options : [];
  if (options.length === 0) return;

  // Use the first radio input as an anchor for overlays/notifications
  const firstSelector = options[0].selector;
  const anchorElement = firstSelector ? document.querySelector(firstSelector) : null;

  const question = field.label || field.name || '';
  if (!question || question.length <= 3) return;

  chrome.runtime.sendMessage({
    action: 'getSmartAnswer',
    question: question,
    field: field
  }, (response) => {
    if (!response || !response.value) return;

    const answerText = String(response.value).toLowerCase().trim();

    // Try to map YES/NO style answers first
    let targetOption = null;
    if (answerText.startsWith('yes')) {
      targetOption = options.find(opt => {
        const t = (opt.label || opt.value || '').toLowerCase();
        return t.includes('yes') || t === 'y' || t === 'true';
      });
    } else if (answerText.startsWith('no')) {
      targetOption = options.find(opt => {
        const t = (opt.label || opt.value || '').toLowerCase();
        return t.includes('no') || t === 'n' || t === 'false';
      });
    }

    // Fallback: generic text match
    if (!targetOption) {
      targetOption = options.find(opt => {
        const t = (opt.label || opt.value || '').toLowerCase();
        return answerText.includes(t) || t.includes(answerText);
      });
    }

    if (!targetOption || !targetOption.selector) return;

    const radioEl = document.querySelector(targetOption.selector);
    if (!radioEl) return;

    radioEl.checked = true;
    radioEl.dispatchEvent(new Event('input', { bubbles: true }));
    radioEl.dispatchEvent(new Event('change', { bubbles: true }));

    if (anchorElement) {
      showQuickNotification(anchorElement, `✓ Selected "${targetOption.label || targetOption.value}"`);
    }
  });
}

/**
 * Cleanup scanner
 */
function cleanupScanner() {
  console.log('JobApply AI scanner disabled');
  // Remove all overlays
  activeOverlays.forEach(overlay => overlay.remove());
  activeOverlays.clear();
  
  // Remove floating panel
  if (floatingPanel) {
    floatingPanel.remove();
    floatingPanel = null;
  }
}

/**
 * Detect if current page is an application page (forms present) or just viewing
 */
function detectIfApplicationPage() {
  // Check URL patterns for application pages
  const url = window.location.href.toLowerCase();
  const applicationUrlPatterns = [
    '/apply',
    '/application',
    '/job-application',
    '/careers/apply',
    'apply.html',
    'application.html',
    'apply?',
    '/jobs/apply'
  ];
  
  if (applicationUrlPatterns.some(pattern => url.includes(pattern))) {
    console.log('✓ URL contains application pattern');
    return true;
  }
  
  // Check for form elements
  const forms = document.querySelectorAll('form');
  const hasInputs = document.querySelectorAll('input[type="text"], input[type="email"], textarea').length > 2;
  
  if (forms.length > 0 && hasInputs) {
    console.log('✓ Page has forms with multiple input fields');
    return true;
  }
  
  // Check for application-specific text
  const pageText = document.body.textContent.toLowerCase();
  const applicationKeywords = [
    'submit application',
    'apply for this',
    'fill out the form',
    'complete your application',
    'resume upload',
    'cover letter'
  ];
  
  const hasKeywords = applicationKeywords.some(keyword => pageText.includes(keyword));
  if (hasKeywords && forms.length > 0) {
    console.log('✓ Page contains application keywords and forms');
    return true;
  }
  
  console.log('✗ Not an application page - likely job description/viewing');
  return false;
}

/**
 * Extract job context from the page
 */
function extractJobContext() {
  console.log('🔍 Starting job extraction...');
  const context = {
    url: window.location.href,
    title: document.title,
    jobTitle: '',
    company: '',
    description: '',
    requirements: [],
    location: '',
    jobType: '',
    department: '',
    workModel: '', // Remote, Hybrid, On-site
    jobNumber: '',
    postedDate: '',
    emails: [], // HR/recruiter emails found on page
    extractedAt: new Date().toISOString()
  };

  let jobTitleElement = null;
  
  // Common selectors for job information
  const jobTitleSelectors = [
    'h1[class*="job"]', 'h1[class*="title"]', '.job-title', 
    '[data-testid="job-title"]', '.jobsearch-JobInfoHeader-title',
    'h1', '.title'
  ];
  
  const companySelectors = [
    '[class*="company-name"]', '[data-testid="company-name"]',
    '.company', 'a[data-company-name]', '[class*="employer"]'
  ];
  
  const descriptionSelectors = [
    // Common main content containers for job boards (e.g. FinOps jobs)
    '.content-container',
    // Generic description containers
    '[class*="description"]', '#job-description', 
    '[data-testid="job-description"]', '.description',
    '[id*="jobDescription"]', '[class*="jobDescription"]'
  ];
  
  // Extract job title
  for (const selector of jobTitleSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      context.jobTitle = element.textContent.trim();
      jobTitleElement = element;
      console.log('✅ Found job title:', context.jobTitle);
      break;
    }
  }

  // Fallback: use document.title if jobTitle is missing or clearly not a real job title
  if (!context.jobTitle || /accessibility\s*links?/i.test(context.jobTitle)) {
    if (document.title && document.title.trim()) {
      context.jobTitle = document.title.trim().substring(0, 200);
      console.log('ℹ️ Using document.title as job title:', context.jobTitle);
    }
  }
  
  // Extract company
  for (const selector of companySelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      context.company = element.textContent.trim();
      console.log('✅ Found company:', context.company);
      break;
    }
  }
  
  // Extract description
  for (const selector of descriptionSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      // Limit to a reasonable length and clean up
      let desc = element.textContent.trim();
      desc = desc.replace(/\s+/g, ' '); // Normalize whitespace
      desc = desc.substring(0, 4000);
      context.description = desc;
      console.log('✅ Found description length:', context.description.length);
      break;
    }
  }
  
  // If no description found, try to extract a focused slice of the page text
  if (!context.description) {
    // Prefer text inside the container around the job title to avoid picking up
    // unrelated feed/side content from the rest of the page.
    let root = document.body;
    if (jobTitleElement) {
      const container = jobTitleElement.closest('section, article, main, div');
      if (container) {
        root = container;
      }
    }

    const fullText = root ? (root.innerText || root.textContent || '') : '';
    const lower = fullText.toLowerCase();

    // Prefer text starting at "job description" or "job summary" if present
    const anchors = ['job description', 'job summary', 'job responsibilities', 'key responsibilities'];
    let startIndex = -1;
    for (const anchor of anchors) {
      const idx = lower.indexOf(anchor);
      if (idx !== -1) {
        startIndex = idx;
        break;
      }
    }

    if (startIndex === -1) {
      // Fallback to first substantial paragraph within the main content area if available
      const mainContainer = document.querySelector('main') || document.querySelector('article') || document.querySelector('.content-container');
      const searchRoot = mainContainer || document;
      const firstPara = searchRoot.querySelector('p');
      if (firstPara && firstPara.textContent) {
        const text = firstPara.textContent.trim();
        if (text.length > 100) {
          context.description = text.substring(0, 4000);
        }
      }
    } else {
      const slice = fullText.substring(startIndex, startIndex + 5000);
      context.description = slice.replace(/\s+/g, ' ').trim().substring(0, 4000);
    }
  }
  
  // Look for job type keywords (use limited text, not entire body)
  const pageText = context.description.toLowerCase() + ' ' + context.title.toLowerCase();
  
  if (pageText.includes('full time') || pageText.includes('full-time')) {
    context.jobType = 'Full Time';
  } else if (pageText.includes('part time') || pageText.includes('part-time')) {
    context.jobType = 'Part Time';
  } else if (pageText.includes('contract')) {
    context.jobType = 'Contract';
  }
  
  // Extract work model
  if (pageText.includes('remote')) {
    context.workModel = 'Remote';
  } else if (pageText.includes('hybrid')) {
    context.workModel = 'Hybrid';
  } else if (pageText.includes('on-site') || pageText.includes('onsite') || pageText.includes('office')) {
    context.workModel = 'On-site';
  }
  
  // Extract location (look for common patterns)
  const locationPatterns = [
    /location[:\s]+([^<\n]+)/i,
    /([A-Z][a-z]+,\s*[A-Z]{2})/,
    /([A-Z][a-z]+\s[A-Z][a-z]+,\s*[A-Z]{2})/
  ];
  for (const pattern of locationPatterns) {
    const match = pageText.match(pattern);
    if (match && match[1]) {
      context.location = match[1].trim();
      break;
    }
  }
  
  // Extract department/area
  const deptPatterns = [
    /department[:\s]+([^<\n]+)/i,
    /team[:\s]+([^<\n]+)/i,
    /division[:\s]+([^<\n]+)/i
  ];
  for (const pattern of deptPatterns) {
    const match = pageText.match(pattern);
    if (match && match[1]) {
      context.department = match[1].trim().substring(0, 100);
      break;
    }
  }
  
  // Extract job number/requisition ID
  const jobNumPatterns = [
    /job\s*(?:id|number|#)[:\s]*(\w+-?\d+)/i,
    /requisition\s*(?:id|number)?[:\s]*(\w+-?\d+)/i,
    /req\s*(?:id)?[:\s#]*(\w+-?\d+)/i
  ];
  for (const pattern of jobNumPatterns) {
    const match = pageText.match(pattern);
    if (match && match[1]) {
      context.jobNumber = match[1].trim();
      break;
    }
  }
  
  // Extract posted date
  const datePatterns = [
    /posted[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /posted[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i
  ];
  for (const pattern of datePatterns) {
    const match = pageText.match(pattern);
    if (match && match[1]) {
      context.postedDate = match[1].trim();
      break;
    }
  }
  
  // Extract emails (excluding user's own email) - use text content only, not HTML
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const bodyTextSample = document.body.textContent.substring(0, 5000); // Only search first 5000 chars
  const emails = bodyTextSample.match(emailPattern) || [];
  const uniqueEmails = [...new Set(emails)];
  
  // Filter out common user emails and get only HR/recruiter emails
  context.emails = uniqueEmails.filter(email => {
    const lowerEmail = email.toLowerCase();
    // Exclude common patterns that are likely user's email or system emails
    return !lowerEmail.includes('noreply') && 
           !lowerEmail.includes('no-reply') &&
           !lowerEmail.includes('donotreply') &&
           !lowerEmail.includes('mailer-daemon') &&
           !lowerEmail.includes('postmaster') &&
           (lowerEmail.includes('hr') || 
            lowerEmail.includes('recruit') || 
            lowerEmail.includes('talent') ||
            lowerEmail.includes('hiring') ||
            emails.length <= 3); // If only a few emails, probably recruiter contacts
  }).slice(0, 5); // Limit to 5 emails
  
  console.log('📊 Job extraction result:', context.jobTitle ? '✅ SUCCESS' : '❌ FAILED');
  return context.jobTitle ? context : null;
}

/**
 * Show recommendations with UI overlays
 */
function showFieldRecommendations(recommendations) {
  console.log(`Showing ${recommendations.length} field recommendations`);
  
  recommendations.forEach(async rec => {
    // Special handling for radio groups (no single selector)
    if (rec.field.type === 'radio') {
      handleRadioRecommendation(rec);
      return;
    }

    const element = document.querySelector(rec.field.selector);
    if (!element) return;
    
    // Skip irrelevant fields
    if (isIrrelevantField(rec.field)) {
      console.log('Skipping irrelevant field:', rec.field.label || rec.field.name);
      return;
    }
    
    // For text fields, get smart answer automatically
    if (rec.field.type === 'input' || rec.field.type === 'textarea') {
      const question = rec.field.label || rec.field.placeholder || rec.field.name;
      
      if (question && question.length > 3) {
        // Get smart answer
        chrome.runtime.sendMessage({
          action: 'getSmartAnswer',
          question: question,
          field: rec.field
        }, (response) => {
          if (response && response.value) {
            // Update recommendation with smart answer
            rec.recommendation.suggestedValue = response.value;
            rec.recommendation.confidence = response.confidence === 'high' ? 'high' : 'medium';
            rec.recommendation.source = response.source;

            // Special handling for checkboxes: decide whether to check or leave unchecked
            if (rec.field.inputType === 'checkbox') {
              const decision = shouldCheckCheckbox(response.value);
              if (decision === false) {
                console.log(`AI suggests NOT checking checkbox for "${question}"`);
                // Do not auto-fill or show a fill button in this case
                return;
              }
            }
            
            // Auto-fill if from cache or profile (high confidence)
            if (response.source === 'cache' || response.source === 'profile') {
              console.log(`Auto-filling "${question}" from ${response.source}`);
              fillFormField(rec.field.selector, response.value);
              
              // Show quick notification
              showQuickNotification(element, `✓ Filled from ${response.source}`);
            } else {
              // Show "Fill with AI" button for AI-generated or uncertain answers
              displayFieldOverlay(element, rec);
            }
          } else {
            // Show default overlay
            displayFieldOverlay(element, rec);
          }
        });
        return;
      }
    }

    // For select/dropdown fields, ask for a smart answer and map it to options
    if (rec.field.type === 'select') {
      const question = rec.field.label || rec.field.placeholder || rec.field.name;
      if (question && question.length > 3 && Array.isArray(rec.field.options) && rec.field.options.length > 0) {
        chrome.runtime.sendMessage({
          action: 'getSmartAnswer',
          question: question,
          field: rec.field
        }, (response) => {
          if (response && response.value) {
            const option = chooseBestSelectOption(rec.field.options, response.value);
            if (option) {
              element.value = option.value;
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
              showQuickNotification(element, `✓ Selected "${option.text}"`);
              return;
            }
          }
          // If we couldn't confidently map, fall back to overlay
          displayFieldOverlay(element, rec);
        });
        return;
      }
    }
    
    // For other fields, show default overlay
    displayFieldOverlay(element, rec);
  });
}

/**
 * Display overlay for a field
 */
function displayFieldOverlay(element, recommendation) {
  const confidence = recommendation.recommendation.confidence;
  const hasValue = recommendation.recommendation.suggestedValue !== null;
  
  // Remove existing overlay for this field
  if (activeOverlays.has(recommendation.field.selector)) {
    activeOverlays.get(recommendation.field.selector).remove();
  }
  
  // Create overlay
  const overlay = createFieldOverlay(element, recommendation);
  activeOverlays.set(recommendation.field.selector, overlay);
}

/**
 * Create overlay UI for a field
 */
function createFieldOverlay(element, recommendation) {
  const overlay = document.createElement('div');
  overlay.className = 'jobapply-ai-overlay';
  
  const confidence = recommendation.recommendation.confidence;
  const suggestedValue = recommendation.recommendation.suggestedValue;
  const isUncertain = confidence === 'low' || !suggestedValue;
  
  overlay.style.cssText = `
    position: absolute;
    z-index: 10000;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    display: flex;
    gap: 8px;
    align-items: center;
    ${isUncertain ? 
      'background: #FEF3C7; border: 1px solid #F59E0B; color: #92400E;' : 
      'background: #DBEAFE; border: 1px solid #3B82F6; color: #1E40AF;'}
  `;
  
  if (isUncertain) {
    overlay.innerHTML = `
      <span>⚠️ Not sure what to put here</span>
      <button class="jobapply-ai-write-btn" style="
        padding: 4px 8px;
        background: #F59E0B;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
      ">Write with AI</button>
    `;
    
    overlay.querySelector('.jobapply-ai-write-btn').onclick = () => {
      handleWriteWithAI(element, recommendation.field);
    };
  } else {
    const source = recommendation.recommendation.source || 'profile';
    const sourceIcon = {
      'cache': '💾',
      'profile': '👤',
      'resume': '📄',
      'ai': '🤖'
    }[source] || '✓';
    
    overlay.innerHTML = `
      <span>${sourceIcon} ${suggestedValue ? 'Ready to fill' : 'Detected'}</span>
      ${suggestedValue ? `
        <button class="jobapply-ai-fill-btn" style="
          padding: 4px 8px;
          background: #3B82F6;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
        ">Fill</button>
      ` : ''}
    `;
    
    const fillBtn = overlay.querySelector('.jobapply-ai-fill-btn');
    if (fillBtn) {
      fillBtn.onclick = () => {
        fillFormField(recommendation.field.selector, suggestedValue);
        showNotification('Field filled', 'success');
        overlay.remove();
        activeOverlays.delete(recommendation.field.selector);
      };
    }
  }
  
  // Position overlay near the field
  positionOverlay(overlay, element);
  document.body.appendChild(overlay);
  
  // Track field changes to learn from user input
  element.addEventListener('change', () => {
    const finalValue = element.value;
    if (finalValue) {
      // Save learned answer to cache
      const question = recommendation.field.label || recommendation.field.placeholder || recommendation.field.name;
      
      chrome.runtime.sendMessage({
        action: 'saveLearnedAnswer',
        question: question,
        answer: finalValue
      });
      
      // Also save to learning data
      chrome.runtime.sendMessage({
        action: 'learnFromInput',
        field: recommendation.field,
        value: finalValue,
        jobContext: jobContext
      });
      
      showNotification('✓ Learned answer', 'success');
      
      // Remove overlay
      if (overlay && overlay.parentNode) {
        overlay.remove();
        activeOverlays.delete(recommendation.field.selector);
      }
    }
  });
  
  return overlay;
}

/**
 * Position overlay near field
 */
function positionOverlay(overlay, element) {
  const rect = element.getBoundingClientRect();
  
  // Initial position: to the left of the field, vertically aligned
  overlay.style.top = `${rect.top + window.scrollY}px`;
  overlay.style.left = `${rect.left + window.scrollX - 8}px`;
  
  // After it's in the DOM, adjust so it sits to the left and doesn't block fields below
  setTimeout(() => {
    const overlayRect = overlay.getBoundingClientRect();

    // Try positioning fully to the left of the field
    overlay.style.left = `${rect.left + window.scrollX - overlayRect.width - 8}px`;
    overlay.style.top = `${rect.top + window.scrollY}px`;

    const updatedRect = overlay.getBoundingClientRect();

    // If it goes off the left edge, move it to the right side instead
    if (updatedRect.left < 0) {
      overlay.style.left = `${rect.right + window.scrollX + 8}px`;
    }

    // If it still overflows on the right, place it above the field
    const finalRect = overlay.getBoundingClientRect();
    if (finalRect.right > window.innerWidth) {
      overlay.style.left = `${rect.left + window.scrollX}px`;
      overlay.style.top = `${rect.top + window.scrollY - finalRect.height - 4}px`;
    }
  }, 0);
}

/**
 * Handle Write with AI button click
 */
async function handleWriteWithAI(element, fieldInfo) {
  showNotification('Generating content with AI...', 'info');
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'generateWithAI',
      field: fieldInfo,
      jobContext: jobContext
    });
    
    if (response.content) {
      element.value = response.content;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      showNotification('Content generated and filled', 'success');
      
      // Remove overlay
      const overlay = activeOverlays.get(fieldInfo.selector);
      if (overlay) {
        overlay.remove();
        activeOverlays.delete(fieldInfo.selector);
      }
    }
  } catch (error) {
    showNotification('Failed to generate content', 'error');
  }
}

/**
 * Show notification toast
 */
function showNotification(text, type = 'info') {
  const notification = document.createElement('div');
  notification.className = 'jobapply-ai-notification';
  
  const colors = {
    success: { bg: '#10B981', icon: '✓' },
    error: { bg: '#EF4444', icon: '✗' },
    info: { bg: '#3B82F6', icon: 'ℹ' }
  };
  
  const style = colors[type] || colors.info;
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    padding: 12px 20px;
    background: ${style.bg};
    color: white;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease-out;
  `;
  
  notification.innerHTML = `${style.icon} ${text}`;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Show quick notification near field (auto-filled)
 */
function showQuickNotification(element, text) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: absolute;
    z-index: 10001;
    padding: 6px 12px;
    background: #10B981;
    color: white;
    border-radius: 6px;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    pointer-events: none;
    animation: fadeIn 0.3s ease-out;
  `;
  
  notification.textContent = text;
  
  // Position near the field
  const rect = element.getBoundingClientRect();
  notification.style.left = (rect.left + window.scrollX) + 'px';
  notification.style.top = (rect.top + window.scrollY - 35) + 'px';
  
  document.body.appendChild(notification);
  
  // Fade out and remove
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

/**
 * Detect and handle skip/continue buttons on autofill pages
 */
function detectAndHandleSkipButtons() {
  // Check if this is an autofill/resume upload page
  const pageText = document.body.textContent.toLowerCase();
  const isAutofillPage = pageText.includes('autofill') || 
                         pageText.includes('upload resume') || 
                         pageText.includes('upload your resume') ||
                         pageText.includes('import from resume');
  
  if (!isAutofillPage) return;
  
  console.log('🔍 Detected autofill/resume page - looking for skip buttons...');
  
  // Common skip/continue button selectors
  const skipSelectors = [
    'button[class*="skip"]',
    'a[class*="skip"]',
    'button:contains("Skip")',
    'button:contains("Continue")',
    'button[class*="continue"]',
    'a[class*="continue"]',
    '[aria-label*="skip"]',
    '[aria-label*="continue"]'
  ];
  
  let skipButton = null;
  
  // Find skip/continue buttons
  document.querySelectorAll('button, a').forEach(el => {
    const text = el.textContent.toLowerCase().trim();
    if ((text === 'skip' || text === 'continue' || text === 'skip this' || text === 'no thanks') && el.offsetParent !== null) {
      skipButton = el;
    }
  });
  
  if (!skipButton) {
    // Try selectors
    for (const selector of skipSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) {
          skipButton = el;
          break;
        }
      } catch (e) {
        // Ignore invalid selectors
      }
    }
  }
  
  if (skipButton) {
    console.log('✅ Found skip/continue button:', skipButton.textContent);
    showSkipCountdown(skipButton);
  }
}

/**
 * Show countdown and auto-click skip button
 */
function showSkipCountdown(button) {
  const countdown = 5; // seconds
  const buttonText = button.textContent.trim();
  
  // Create countdown overlay
  const overlay = document.createElement('div');
  overlay.id = 'jobapply-skip-countdown';
  overlay.innerHTML = `
    <div class="countdown-content">
      <div class="countdown-header">
        <span class="countdown-icon">⏭️</span>
        <span class="countdown-title">Auto-Skip Detected</span>
      </div>
      <div class="countdown-message">Will click "${buttonText}" in:</div>
      <div class="countdown-timer">${countdown}</div>
      <div class="countdown-progress">
        <div class="countdown-bar"></div>
      </div>
      <button class="countdown-cancel">Cancel</button>
    </div>
  `;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    #jobapply-skip-countdown {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 9999999;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
      padding: 24px;
      min-width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    
    .countdown-content {
      text-align: center;
    }
    
    .countdown-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .countdown-icon {
      font-size: 24px;
    }
    
    .countdown-title {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    }
    
    .countdown-message {
      font-size: 14px;
      color: #6b7280;
      margin-bottom: 16px;
    }
    
    .countdown-timer {
      font-size: 48px;
      font-weight: 700;
      color: #3b82f6;
      margin-bottom: 16px;
      animation: pulse 1s ease-in-out infinite;
    }
    
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    
    .countdown-progress {
      width: 100%;
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 16px;
    }
    
    .countdown-bar {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #8b5cf6);
      width: 100%;
      animation: shrink ${countdown}s linear;
    }
    
    @keyframes shrink {
      from { width: 100%; }
      to { width: 0%; }
    }
    
    .countdown-cancel {
      padding: 10px 20px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .countdown-cancel:hover {
      background: #dc2626;
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(overlay);
  
  // Update activity panel
  addActivityToPanel({
    type: 'waiting',
    message: `⏭️ Auto-clicking "${buttonText}" in ${countdown}s...`
  });
  
  let timeLeft = countdown;
  const timerElement = overlay.querySelector('.countdown-timer');
  
  const interval = setInterval(() => {
    timeLeft--;
    if (timerElement) timerElement.textContent = timeLeft;
    
    if (timeLeft <= 0) {
      clearInterval(interval);
      overlay.remove();
      
      // Click the button
      button.click();
      console.log('✅ Auto-clicked skip/continue button');
      
      addActivityToPanel({
        type: 'success',
        message: `✅ Clicked "${buttonText}" button`
      });
    }
  }, 1000);
  
  // Cancel button
  overlay.querySelector('.countdown-cancel').addEventListener('click', () => {
    clearInterval(interval);
    overlay.remove();
    console.log('❌ User cancelled auto-skip');
    
    addActivityToPanel({
      type: 'waiting',
      message: `❌ Auto-skip cancelled by user`
    });
  });
}
function detectApplyButton() {
  // Common Apply Now button selectors
  const applySelectors = [
    'button[data-apply]',
    'button[class*="apply"]',
    'a[class*="apply"]',
    'button:contains("Apply")',
    'a:contains("Apply Now")',
    '[aria-label*="Apply"]'
  ];
  
  // Find apply buttons
  const buttons = [];
  applySelectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const text = el.textContent.toLowerCase();
        if (text.includes('apply') && !text.includes('applied')) {
          buttons.push(el);
        }
      });
    } catch (e) {
      // Ignore invalid selectors
    }
  });
  
  // Also check for buttons with "apply" text
  document.querySelectorAll('button, a').forEach(el => {
    const text = el.textContent.toLowerCase().trim();
    if ((text === 'apply' || text === 'apply now' || text.startsWith('apply for')) && !buttons.includes(el)) {
      buttons.push(el);
    }
  });
  
  // Add click listeners to track application start (but don't mark as applied yet)
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      console.log('Apply button clicked - starting application process');
      
      // Change page state to 'applying'
      pageState = 'applying';
      
      addActivityToPanel({
        type: 'ai-generating',
        message: '📝 Starting application process - scanning for forms...'
      });
      
      // Wait for application page to load, then scan for forms
      setTimeout(() => {
        console.log('🔍 Page state changed to APPLYING - scanning for forms...');
        if (!hasScannedForms) {
          scanAndAnalyzeForms();
          hasScannedForms = true;
        }
      }, 2000);
      
      // Also start looking for submit buttons
      setTimeout(() => detectSubmitButtons(), 2500);
    });
  });
  
  if (buttons.length > 0) {
    console.log(`Found ${buttons.length} apply button(s)`);
  }
}

/**
 * Detect submit/send buttons (actual submission)
 */
function detectSubmitButtons() {
  console.log('🔍 Looking for submit buttons...');
  
  // Common submit button selectors
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button[class*="submit"]',
    'button[class*="send"]',
    'a[class*="submit"]'
  ];
  
  const submitButtons = [];
  
  // Find submit buttons
  document.querySelectorAll('button, input[type="submit"], a').forEach(el => {
    const text = el.textContent.toLowerCase().trim();
    const type = el.type?.toLowerCase();
    
    // Look for submit, send, finish, complete buttons
    if (type === 'submit' || 
        text === 'submit' || 
        text === 'submit application' ||
        text === 'send application' ||
        text === 'finish' ||
        text === 'complete application' ||
        text.includes('submit my application')) {
      submitButtons.push(el);
    }
  });
  
  if (submitButtons.length > 0) {
    console.log(`✅ Found ${submitButtons.length} submit button(s)`);
    
    // Add click listeners to submit buttons
    submitButtons.forEach(button => {
      button.addEventListener('click', () => {
        console.log('🎯 Submit button clicked - marking as applied!');
        
        // Mark as applied after short delay
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: 'markAsApplied',
            url: window.location.href
          });
          showNotification('Application submitted!', 'success');
          
          addActivityToPanel({
            type: 'success',
            message: '🎉 Application submitted and marked as applied!'
          });
        }, 1000);
      });
    });
  } else {
    // If no submit buttons found, keep monitoring
    setTimeout(() => detectSubmitButtons(), 3000);
  }
}

/**
 * Create persistent floating activity panel
 */
let floatingPanel = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

function createFloatingPanel() {
  if (floatingPanel) return;
  
  floatingPanel = document.createElement('div');
  floatingPanel.id = 'jobapply-ai-floating-panel';
  floatingPanel.innerHTML = `
    <div class="panel-header">
      <div class="panel-title">
        <span class="panel-icon">🤖</span>
        <span>JobApply AI</span>
      </div>
      <div class="panel-controls">
        <button class="panel-btn minimize-btn" title="Minimize">_</button>
        <button class="panel-btn close-btn" title="Close">✕</button>
      </div>
    </div>
    <div class="panel-content">
      <div class="activity-list" id="floating-activity-list">
        <div class="activity-item">� Scanning page for job information...</div>
      </div>
    </div>
    <div class="panel-footer">
      <button class="mark-applied-btn">Mark as Applied</button>
    </div>
  `;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    #jobapply-ai-floating-panel {
      position: fixed;
      top: 100px;
      right: 20px;
      width: 320px;
      max-height: 500px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    #jobapply-ai-floating-panel.minimized .panel-content,
    #jobapply-ai-floating-panel.minimized .panel-footer {
      display: none;
    }
    
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(255,255,255,0.1);
      cursor: move;
      user-select: none;
    }
    
    .panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: white;
      font-weight: 600;
      font-size: 14px;
    }
    
    .panel-icon {
      font-size: 18px;
    }
    
    .panel-controls {
      display: flex;
      gap: 4px;
    }
    
    .panel-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: rgba(255,255,255,0.2);
      color: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    
    .panel-btn:hover {
      background: rgba(255,255,255,0.3);
    }
    
    .panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      background: white;
      max-height: 380px;
    }
    
    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .activity-item {
      padding: 8px 12px;
      background: #f8f9fa;
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.4;
      animation: slideInRight 0.3s ease-out;
    }
    
    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    .activity-item.success {
      background: #d4edda;
      color: #155724;
      border-left: 3px solid #28a745;
    }
    
    .activity-item.error {
      background: #f8d7da;
      color: #721c24;
      border-left: 3px solid #dc3545;
    }
    
    .activity-item.analyzing {
      background: #d1ecf1;
      color: #0c5460;
      border-left: 3px solid #17a2b8;
    }
    
    .activity-item.ai-generating {
      background: #cce5ff;
      color: #004085;
      border-left: 3px solid #007bff;
    }
    
    .activity-item.job-found {
      background: #fff3cd;
      color: #856404;
      border-left: 3px solid #ffc107;
      font-weight: 600;
    }
    
    .panel-footer {
      padding: 12px;
      background: rgba(255,255,255,0.95);
      border-top: 1px solid rgba(0,0,0,0.1);
    }
    
    .mark-applied-btn {
      width: 100%;
      padding: 10px;
      background: #28a745;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .mark-applied-btn:hover {
      background: #218838;
    }
    
    .panel-content::-webkit-scrollbar {
      width: 6px;
    }
    
    .panel-content::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    
    .panel-content::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 3px;
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(floatingPanel);
  
  // Make draggable
  const header = floatingPanel.querySelector('.panel-header');
  header.addEventListener('mousedown', startDrag);
  
  // Minimize button
  floatingPanel.querySelector('.minimize-btn').addEventListener('click', () => {
    floatingPanel.classList.toggle('minimized');
  });
  
  // Close button
  floatingPanel.querySelector('.close-btn').addEventListener('click', () => {
    floatingPanel.remove();
    floatingPanel = null;
  });
  
  // Mark as applied button
  floatingPanel.querySelector('.mark-applied-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'markAsApplied',
      url: window.location.href
    }, (response) => {
      if (response && response.success) {
        showNotification('Marked as applied!', 'success');
      }
    });
  });
  
  // Load recent activity from storage
  chrome.storage.local.get(['activityFeed'], (result) => {
    if (result.activityFeed && result.activityFeed.length > 0) {
      const activityList = document.getElementById('floating-activity-list');
      if (activityList) {
        activityList.innerHTML = ''; // Clear initializing message
        // Show last 10 activities
        result.activityFeed.slice(0, 10).forEach(activity => {
          addActivityToPanel(activity);
        });
      }
    }
  });
}

function startDrag(e) {
  isDragging = true;
  const rect = floatingPanel.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', stopDrag);
}

function drag(e) {
  if (!isDragging) return;
  
  let left = e.clientX - dragOffset.x;
  let top = e.clientY - dragOffset.y;
  
  // Keep panel on screen
  left = Math.max(0, Math.min(left, window.innerWidth - floatingPanel.offsetWidth));
  top = Math.max(0, Math.min(top, window.innerHeight - floatingPanel.offsetHeight));
  
  floatingPanel.style.left = left + 'px';
  floatingPanel.style.top = top + 'px';
  floatingPanel.style.right = 'auto';
}

function stopDrag() {
  isDragging = false;
  document.removeEventListener('mousemove', drag);
  document.removeEventListener('mouseup', stopDrag);
}

function addActivityToPanel(activity) {
  if (!floatingPanel) return;
  
  const activityList = document.getElementById('floating-activity-list');
  if (!activityList) return;
  
  const activityItem = document.createElement('div');
  activityItem.className = `activity-item ${activity.type}`;
  activityItem.textContent = activity.message;
  
  // Add to top of list
  activityList.insertBefore(activityItem, activityList.firstChild);
  
  // Keep only last 20 items
  while (activityList.children.length > 20) {
    activityList.removeChild(activityList.lastChild);
  }
}
