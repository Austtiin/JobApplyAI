# JobApply AI - Testing & Troubleshooting Guide

## 🚀 How to Test the Extension

### 1. Load the Extension
1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Reload" if extension is already loaded, or "Load unpacked" and select `dist` folder
4. Pin the extension icon to toolbar for easy access

### 2. Visit a Job Page
Try these sites:
- **LinkedIn Jobs**: https://www.linkedin.com/jobs/
- **Indeed**: https://www.indeed.com/
- **Company career pages** (e.g., Microsoft, Google careers)
- **Any job posting URL**

### 3. What Should Happen Automatically

#### **On Page Load (No clicking needed!)**
1. **Floating panel appears** on the right side of the page
2. Panel shows: "🔍 Scanning page for job information..."
3. After 0.5-2 seconds:
   - If job found: Panel updates with "🎯 FOUND JOB: [Job Title] at [Company]"
   - If no job found: Panel shows "ℹ️ No job posting detected..."
4. **Background activity** (check console with F12):
   - "JobApply AI content script loaded"
   - "🔍 Starting job extraction..."
   - "✅ Found job title: [title]"
   - "✅ Found company: [company]"
   - "📊 Job extraction result: ✅ SUCCESS"

### 4. Enable Full Features
1. Click the extension icon in toolbar
2. Toggle "Enable Extension" ON
3. Now it will:
   - Scan application forms
   - Show auto-fill suggestions
   - Analyze job fit with AI
   - Learn from your inputs

## 🔍 Troubleshooting

### Problem: "Initializing..." Never Changes

**Check Console (F12 → Console tab):**
```
Look for:
- "JobApply AI content script loaded" ← Should appear immediately
- "🔍 Starting job extraction..." ← Should appear after ~500ms
- "✅ Found job title: ..." ← Confirms job detected
```

**If you don't see these logs:**
1. Extension may not be loaded - check `chrome://extensions/`
2. Page may have loaded before extension - **Refresh the page (F5)**
3. Content script may have crashed - click "Reload" on extension

**If you see "❌ FAILED" in console:**
- The page doesn't have standard job posting HTML
- Try a different job site (LinkedIn works best)
- Check "Elements" tab in DevTools - look for h1 with job title

### Problem: Panel Shows "No Job Detected"

This is normal for:
- Non-job pages (Google, news sites, etc.)
- Job search result pages (not the actual job posting)
- Pages that load content very slowly

**How to fix:**
1. Make sure you're on an **actual job posting page** (not search results)
2. Wait 2-3 seconds for dynamic content to load
3. **Click "Apply" or "Apply Now" on the job page** - this often loads the full description
4. Refresh the page (F5)

### Problem: Activity Feed Doesn't Update

**Check:**
1. Open browser console (F12)
2. Look for red errors
3. Make sure Ollama is running at `http://localhost:11434`
4. Test Ollama: Open terminal and run:
   ```
   curl http://localhost:11434/api/tags
   ```
   Should return list of models

**If activity feed is stuck:**
1. Click extension icon → "Dashboard"
2. Check "History" tab - does it show any jobs?
3. If history is empty, job detection isn't working (see above)

### Problem: "Apply Now" Button Not Detected

**This is normal!** The extension looks for:
- Buttons with "apply" in class/text
- Links with "apply" in class/text
- Common job site apply buttons

**If you click Apply and it doesn't mark as applied:**
1. **Manually mark it**: Click "Mark as Applied" button in floating panel
2. Or go to Dashboard → History → Find the job → Status will show "Viewed"
3. Extension auto-marks after 2 seconds of clicking apply buttons

## 🐛 Debugging Tips

### Check Extension Logs
```
1. chrome://extensions/
2. Find "JobApply AI"
3. Click "Inspect views: service worker"
4. Console tab shows background script logs
```

You should see:
- "JobApply AI installed"
- "[Activity] success: JobApply AI initialized successfully!"
- "[Activity] job-found: 🎯 FOUND JOB: ..."

### Check Page Logs
```
1. F12 on the job page
2. Console tab
3. Filter by "JobApply"
```

### Check Storage
```
1. F12 on job page
2. Application tab → Storage → Local Storage
3. Look for extension ID
4. Check keys:
   - activityFeed (array of recent activities)
   - applicationHistory (jobs you've viewed)
   - currentJobContext (current job data)
```

### Force Reload Everything
```
1. chrome://extensions/
2. Click "Reload" on JobApply AI
3. Close all job posting tabs
4. Clear cache: chrome://settings/clearBrowserData
5. Reopen job posting
6. Hard refresh: Ctrl+Shift+R
```

## ✅ Verification Checklist

- [ ] Extension loaded and enabled in chrome://extensions/
- [ ] Ollama running at localhost:11434
- [ ] Visiting actual job posting page (not search results)
- [ ] Console shows "JobApply AI content script loaded"
- [ ] Floating panel visible on page
- [ ] Panel updates from "Initializing" to job info or "no job detected"
- [ ] Dashboard → History shows jobs you've visited
- [ ] Click extension icon shows stats and activity feed

## 📞 Need More Help?

**Check these in order:**

1. **Console Errors** (F12 → Console)
   - Red errors? Share them for debugging
   
2. **Network Tab** (F12 → Network)
   - Is Ollama reachable? Look for requests to localhost:11434
   
3. **Extension Background Console**
   - chrome://extensions/ → Inspect views
   - Check for initialization errors

4. **Page HTML Structure**
   - Right-click job title → Inspect
   - Look for h1, h2, or elements with class containing "job" or "title"
   - If nothing found, the site may not be compatible

## 🎯 Best Testing Pages

**Highly Compatible:**
- LinkedIn job postings (individual job pages)
- Indeed job descriptions
- Glassdoor job pages
- Company career sites (Microsoft, Google, Amazon)

**May Not Work:**
- Job aggregators (just lists)
- PDF job postings
- Application portal login pages
- Sites with heavy JavaScript/React that loads slowly

---

**Current version:** 1.0.0  
**Last updated:** January 2026
