import React, { useState, useEffect } from 'react';

function Dashboard() {
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [preferences, setPreferences] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [learningData, setLearningData] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    // Load user profile and application history
    chrome.storage.local.get(['userProfile', 'applicationHistory', 'userPreferences', 'resumeData', 'learningData'], (result) => {
      if (result.userProfile) setProfile(result.userProfile);
      if (result.applicationHistory) setHistory(result.applicationHistory);
      if (result.userPreferences) setPreferences(result.userPreferences);
      if (result.resumeData) setResumeFile(result.resumeData);
      if (result.learningData) setLearningData(result.learningData);
    });

    // Load current AI conversation summary from background
    chrome.runtime.sendMessage({ action: 'getConversationStatus' }, (response) => {
      if (response) {
        setConversation(response);
      }
    });
  }, []);

  // Helper to update profile and persist immediately
  const updateProfile = (partial) => {
    const next = { ...(profile || {}), ...partial };
    setProfile(next);
    chrome.storage.local.set({ userProfile: next });
  };

  // Helper to update preferences and persist immediately
  const updatePreferences = (partial) => {
    const next = { ...(preferences || {}), ...partial };
    setPreferences(next);
    chrome.storage.local.set({ userPreferences: next });
  };

  const saveProfile = async () => {
    await chrome.storage.local.set({ userProfile: profile });
    alert('Profile saved!');
  };
  
  const savePreferences = async () => {
    await chrome.storage.local.set({ userPreferences: preferences });
    alert('Preferences saved!');
  };
  
  const handleResumeUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const resumeData = {
        name: file.name,
        type: file.type,
        data: e.target.result,
        uploadedAt: new Date().toISOString()
      };
      
      await chrome.storage.local.set({ resumeData });
      setResumeFile(resumeData);
      alert('Resume uploaded successfully!');
    };
    
    reader.readAsDataURL(file);
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>JobApply AI Dashboard</h1>
        <div className="tabs">
          <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>Profile</button>
          <button className={activeTab === 'preferences' ? 'active' : ''} onClick={() => setActiveTab('preferences')}>Preferences</button>
          <button className={activeTab === 'resume' ? 'active' : ''} onClick={() => setActiveTab('resume')}>Resume</button>
          <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>History</button>
          <button className={activeTab === 'learning' ? 'active' : ''} onClick={() => setActiveTab('learning')}>Learning Data</button>
          <button
            className={activeTab === 'conversation' ? 'active' : ''}
            onClick={() => {
              setActiveTab('conversation');
              chrome.runtime.sendMessage({ action: 'getConversationStatus' }, (response) => {
                if (response) setConversation(response);
              });
            }}
          >
            AI Conversation
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        {activeTab === 'profile' && (
          <section className="profile-section">
            <h2>Your Profile</h2>
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                value={profile?.fullName || ''}
                onChange={(e) => updateProfile({ fullName: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={profile?.email || ''}
                onChange={(e) => updateProfile({ email: e.target.value })}
                placeholder="john@example.com"
              />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input
                type="tel"
                value={profile?.phone || ''}
                onChange={(e) => updateProfile({ phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div className="form-group">
              <label>LinkedIn URL</label>
              <input
                type="url"
                value={profile?.linkedin || ''}
                onChange={(e) => updateProfile({ linkedin: e.target.value })}
                placeholder="https://linkedin.com/in/johndoe"
              />
            </div>
            <div className="form-group">
              <label>Years of Experience</label>
              <input
                type="number"
                value={profile?.yearsExperience || ''}
                onChange={(e) => updateProfile({ yearsExperience: e.target.value })}
                placeholder="5"
              />
            </div>
            <button className="save-btn" onClick={saveProfile}>
              Save Profile
            </button>
          </section>
        )}
        
        {activeTab === 'preferences' && (
          <section className="preferences-section">
            <h2>Your Preferences</h2>
            <div className="form-group">
              <label>Preferred Job Type</label>
              <select
                value={preferences?.jobType || 'Full Time'}
                onChange={(e) => updatePreferences({ jobType: e.target.value })}
              >
                <option value="Full Time">Full Time</option>
                <option value="Part Time">Part Time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </div>
            <div className="form-group">
              <label>Preferred Location</label>
              <input
                type="text"
                value={preferences?.location || ''}
                onChange={(e) => updatePreferences({ location: e.target.value })}
                placeholder="San Francisco, CA or Remote"
              />
            </div>
            <div className="form-group">
              <label>Work Authorization</label>
              <select
                value={preferences?.workAuthorization || ''}
                onChange={(e) => updatePreferences({ workAuthorization: e.target.value })}
              >
                <option value="">Select...</option>
                <option value="US Citizen">US Citizen</option>
                <option value="Green Card">Green Card</option>
                <option value="H1B">H1B Visa</option>
                <option value="Need Sponsorship">Need Sponsorship</option>
              </select>
            </div>
            <div className="form-group">
              <label>Willing to Relocate</label>
              <select
                value={preferences?.willingToRelocate || 'No'}
                onChange={(e) => updatePreferences({ willingToRelocate: e.target.value })}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
            <div className="form-group">
              <label>Veteran Status</label>
              <select
                value={preferences?.veteranStatus || 'Not a Veteran'}
                onChange={(e) => updatePreferences({ veteranStatus: e.target.value })}
              >
                <option value="Not a Veteran">Not a Veteran</option>
                <option value="Veteran">Veteran</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
            <div className="form-group">
              <label>Disability Status</label>
              <select
                value={preferences?.disabilityStatus || 'No Disability'}
                onChange={(e) => updatePreferences({ disabilityStatus: e.target.value })}
              >
                <option value="No Disability">No Disability</option>
                <option value="Has Disability">Has Disability</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
            <div className="form-group">
              <label>Security Clearance</label>
              <select
                value={preferences?.securityClearance || 'None'}
                onChange={(e) => updatePreferences({ securityClearance: e.target.value })}
              >
                <option value="None">None</option>
                <option value="Public Trust">Public Trust</option>
                <option value="Secret">Secret</option>
                <option value="Top Secret">Top Secret</option>
              </select>
            </div>
            <div className="form-group">
              <label>Requires Sponsorship</label>
              <select
                value={preferences?.requiresSponsorship || 'No'}
                onChange={(e) => updatePreferences({ requiresSponsorship: e.target.value })}
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            <div className="form-group">
              <label>Willing to Travel</label>
              <select
                value={preferences?.willingToTravel || 'Occasionally'}
                onChange={(e) => updatePreferences({ willingToTravel: e.target.value })}
              >
                <option value="Never">Never</option>
                <option value="Occasionally">Occasionally</option>
                <option value="Frequently">Frequently</option>
              </select>
            </div>
            <div className="form-group">
              <label>Notice Period</label>
              <input
                type="text"
                value={preferences?.noticePeriod || ''}
                onChange={(e) => updatePreferences({ noticePeriod: e.target.value })}
                placeholder="2 weeks"
              />
            </div>
            <div className="form-group">
              <label>Salary Expectation</label>
              <input
                type="text"
                value={preferences?.salaryExpectation || ''}
                onChange={(e) => updatePreferences({ salaryExpectation: e.target.value })}
                placeholder="$120,000 per year"
              />
            </div>
            <div className="form-group">
              <label>Available Start Date</label>
              <input
                type="text"
                value={preferences?.availableStartDate || ''}
                onChange={(e) => updatePreferences({ availableStartDate: e.target.value })}
                placeholder="e.g. 2 weeks from offer"
              />
            </div>
            <button className="save-btn" onClick={savePreferences}>
              Save Preferences
            </button>
          </section>
        )}
        
        {activeTab === 'resume' && (
          <section className="resume-section">
            <h2>Resume</h2>
            {resumeFile ? (
              <div className="resume-info">
                <p><strong>Uploaded:</strong> {resumeFile.name}</p>
                <p><strong>Date:</strong> {new Date(resumeFile.uploadedAt).toLocaleDateString()}</p>
                <button className="secondary-btn" onClick={() => setResumeFile(null)}>Remove Resume</button>
              </div>
            ) : (
              <div className="upload-area">
                <p>Upload your resume for automatic filling of resume fields</p>
                <input type="file" accept=".pdf,.doc,.docx" onChange={handleResumeUpload} />
              </div>
            )}
          </section>
        )}
        
        {activeTab === 'history' && (
          <section className="history-section">
            <h2>Application History</h2>
            {history.length === 0 ? (
              <p className="empty-state">No applications yet. Start applying to jobs!</p>
            ) : (
              <div className="history-list">
                {history.map((app, index) => (
                  <div key={index} className="history-item">
                    <div className="history-header">
                      <h3>{app.jobTitle || app.position}</h3>
                      <span className={`status-badge ${app.applied ? 'applied' : 'viewed'}`}>
                        {app.applied ? '✓ Applied' : '👁️ Viewed'}
                      </span>
                    </div>
                    <p className="history-company">🏢 {app.company}</p>
                    {app.fitScore && (
                      <div className="fit-score">
                        <span className={`score ${app.fitScore.score >= 80 ? 'high' : app.fitScore.score >= 60 ? 'medium' : 'low'}`}>
                          Match: {app.fitScore.score}%
                        </span>
                        <span className="fit-reason">{app.fitScore.reason}</span>
                      </div>
                    )}
                    <div className="job-details">
                      {app.location && <span>📍 {app.location}</span>}
                      {app.jobType && <span>💼 {app.jobType}</span>}
                      {app.workModel && <span>🏠 {app.workModel}</span>}
                      {app.department && <span>🏷️ {app.department}</span>}
                    </div>
                    {app.jobNumber && (
                      <p className="job-number">Job #: {app.jobNumber}</p>
                    )}
                    {app.emails && app.emails.length > 0 && (
                      <div className="contact-emails">
                        <strong>Contacts:</strong>
                        {app.emails.map((email, i) => (
                          <a key={i} href={`mailto:${email}`} className="email-link">
                            {email}
                          </a>
                        ))}
                      </div>
                    )}
                    <a href={app.url} target="_blank" rel="noopener noreferrer" className="history-url">
                      🔗 View Job Posting
                    </a>
                    <div className="history-footer">
                      <span className="date-info">
                        {app.applied ? 
                          `Applied: ${new Date(app.appliedAt).toLocaleDateString()}` :
                          `Last viewed: ${new Date(app.lastViewed || app.extractedAt).toLocaleDateString()}`
                        }
                      </span>
                      {app.postedDate && <span>Posted: {app.postedDate}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        
        {activeTab === 'learning' && (
          <section className="learning-section">
            <h2>Learning Data</h2>
            <p className="info-text">
              The extension learns from your inputs to provide better suggestions over time.
            </p>
            {learningData.length === 0 ? (
              <p className="empty-state">No learning data yet. The extension will learn as you use it!</p>
            ) : (
              <div>
                <p className="stats-text">Learned patterns: {learningData.length}</p>
                <div className="learning-list">
                  {learningData.slice(-10).reverse().map((item, index) => (
                    <div key={index} className="learning-item">
                      <div className="learning-field">
                        <strong>{item.fieldLabel || item.fieldName}</strong>
                      </div>
                      <div className="learning-value">{item.value}</div>
                      <div className="learning-meta">
                        {item.jobType && <span className="badge">{item.jobType}</span>}
                        <span className="date">{new Date(item.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === 'conversation' && (
          <section className="conversation-section">
            <h2>AI Conversation</h2>
            <p className="info-text">
              This shows the current chat between JobApply AI and the model for your latest job application.
            </p>
            {!conversation || conversation.messageCount === 0 ? (
              <p className="empty-state">No active AI conversation yet. Visit a job posting and let the assistant analyze it.</p>
            ) : (
              <div className="conversation-view">
                {conversation.messages.map((msg, index) => (
                  <div key={index} className={`conversation-message ${msg.role}`}>
                    <div className="conversation-meta">
                      <span className="role">{msg.role.toUpperCase()}</span>
                    </div>
                    <div className="conversation-content">{msg.content}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
