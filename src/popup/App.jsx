import React, { useState, useEffect } from 'react';

function App() {
  const [isActive, setIsActive] = useState(false);
  const [stats, setStats] = useState({ formsDetected: 0, fieldsAutofilled: 0, pagesScanned: 0 });
  const [learningCount, setLearningCount] = useState(0);
  const [hasResume, setHasResume] = useState(false);
  const [currentJob, setCurrentJob] = useState(null);
  const [activityFeed, setActivityFeed] = useState([]);
  const [showActivityPanel, setShowActivityPanel] = useState(true);
  const [scanningAnimation, setScanningAnimation] = useState(false);

  useEffect(() => {
    // Load state from storage
    chrome.storage.local.get(['isActive', 'stats', 'learningData', 'resumeData', 'currentJobContext', 'activityFeed'], (result) => {
      if (result.isActive !== undefined) setIsActive(result.isActive);
      if (result.stats) {
        setStats(result.stats);
      }
      if (result.learningData) setLearningCount(result.learningData.length);
      if (result.resumeData) setHasResume(true);
      if (result.currentJobContext) setCurrentJob(result.currentJobContext);
      if (result.activityFeed) setActivityFeed(result.activityFeed);
    });

    // Listen for activity updates
    const handleMessage = (message) => {
      if (message.action === 'updateActivity') {
        setActivityFeed(prev => {
          const newFeed = [message.activity, ...prev].slice(0, 50);
          chrome.storage.local.set({ activityFeed: newFeed });
          return newFeed;
        });
      }
    };

    // Listen for storage changes (for stat updates)
    const handleStorageChange = (changes, area) => {
      if (area === 'local' && changes.stats) {
        const newStats = changes.stats.newValue;
        const oldStats = changes.stats.oldValue || { pagesScanned: 0 };
        setStats(newStats);
        
        // Trigger animation if pagesScanned increased
        if (newStats.pagesScanned > oldStats.pagesScanned) {
          setScanningAnimation(true);
          setTimeout(() => setScanningAnimation(false), 1000);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.storage.onChanged.addListener(handleStorageChange);
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const toggleExtension = async () => {
    const newState = !isActive;
    setIsActive(newState);
    await chrome.storage.local.set({ isActive: newState });

    // Notify content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'toggleExtension', isActive: newState });
  };

  const openDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') });
  };

  const getActivityIcon = (type) => {
    const icons = {
      'scanning': '🔍',
      'analyzing': '🤔',
      'success': '✓',
      'filled': '📝',
      'learned': '🧠',
      'ai-generating': '🤖',
      'ai-complete': '✨',
      'error': '⚠',
      'waiting': '⏳',
      'job-found': '🎯',
      'resume-detected': '📄',
      'uncertain': '❓'
    };
    return icons[type] || 'ℹ';
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 1000) return 'Just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className="popup-container">
      <div className="header">
        <h1>JobApply AI</h1>
        <div className={`status-indicator ${isActive ? 'active' : 'inactive'}`}>
          {isActive ? '● Active' : '○ Inactive'}
        </div>
      </div>

      <button className="toggle-btn" onClick={toggleExtension}>
        {isActive ? 'Disable Extension' : 'Enable Extension'}
      </button>

      {currentJob && (
        <div className="current-job">
          <h3>Current Job</h3>
          <p className="job-title">{currentJob.jobTitle}</p>
          {currentJob.company && <p className="job-company">{currentJob.company}</p>}
        </div>
      )}

      <div className="stats">
        <h3>Session Stats</h3>
        <div className="stat-item">
          <span>Forms Detected:</span>
          <span className="stat-value">{stats.formsDetected}</span>
        </div>
        <div className="stat-item">
          <span>Fields Autofilled:</span>
          <span className="stat-value">{stats.fieldsAutofilled}</span>
        </div>
        <div className="stat-item">
          <span>Pages Scanned:</span>
          <span className="stat-value">
            {stats.pagesScanned || 0}
            {scanningAnimation && <span className="scan-indicator">↑</span>}
          </span>
        </div>
        <div className="stat-item">
          <span>Learning Patterns:</span>
          <span className="stat-value">{learningCount}</span>
        </div>
      </div>

      <div className="quick-status">
        <div className={`status-badge ${hasResume ? 'success' : 'warning'}`}>
          {hasResume ? '✓ Resume uploaded' : '⚠ No resume'}
        </div>
      </div>

      <div className="activity-section">
        <div className="activity-header">
          <h3>Activity Feed</h3>
          <button 
            className="toggle-activity" 
            onClick={() => setShowActivityPanel(!showActivityPanel)}
          >
            {showActivityPanel ? '▼' : '▶'}
          </button>
        </div>
        
        {showActivityPanel && (
          <div className="activity-feed">
            {activityFeed.length === 0 ? (
              <div className="activity-empty">No activity yet. Enable extension on a job page.</div>
            ) : (
              activityFeed.map((activity, index) => (
                <div key={index} className={`activity-item ${activity.type}`}>
                  <span className="activity-icon">{getActivityIcon(activity.type)}</span>
                  <div className="activity-content">
                    <div className="activity-message">{activity.message}</div>
                    <div className="activity-time">{formatTime(activity.timestamp)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <button className="dashboard-btn" onClick={openDashboard}>
        Open Dashboard
      </button>
    </div>
  );
}

export default App;
