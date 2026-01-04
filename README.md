# JobApply AI

A smart Chrome extension that uses AI to help automate job applications. The extension scans job application forms, learns from user interactions, and intelligently fills out forms using local LLM (Ollama).

## Features

- 🤖 **AI-Powered Form Detection**: Automatically detects and analyzes job application forms
- 📝 **Smart Autofill**: Uses local LLM to understand form fields and suggest appropriate values
- 💾 **User Profile Management**: Store your information once, use it everywhere
- 📊 **Application Tracking**: Keep track of all your job applications
- 🔒 **Privacy-First**: All data stored locally, optional local LLM with Ollama
- 🎯 **Adaptive Learning**: Learns from your interactions to improve over time

## Tech Stack

- **React + Vite**: Modern UI for popup and dashboard
- **Plain JavaScript**: Fast content scripts for page scanning
- **Chrome Storage API**: Local data persistence
- **Ollama**: Local LLM for intelligent form analysis
- **Manifest V3**: Latest Chrome extension standard

## Setup

### Prerequisites

1. **Node.js** (v18 or higher)
2. **Ollama** (for local LLM) - [Download here](https://ollama.ai)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Austtiin/JobApplyAI.git
cd JobApplyAI
```

2. Install dependencies:
```bash
npm install
```

3. Build the extension:
```bash
npm run build
```

4. Set up Ollama (optional but recommended):
```bash
# Pull a lightweight model
ollama pull llama3.2:3b

# Start Ollama server
ollama serve
```

5. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

## Development

Run in development mode with auto-rebuild:

```bash
npm run dev
```

Then reload the extension in Chrome when you make changes.

## Usage

1. **Set Up Your Profile**:
   - Click the extension icon
   - Go to Dashboard
   - Fill in your information (name, email, phone, LinkedIn, etc.)

2. **Apply for Jobs**:
   - Navigate to a job application page
   - Click the extension icon and enable it
   - The extension will detect forms and suggest values
   - Review and confirm autofill suggestions

3. **Track Applications**:
   - View your application history in the Dashboard
   - See statistics on forms filled

## Project Structure

```
JobApplyAI/
├── src/
│   ├── popup/              # Extension popup UI (React)
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.html
│   │   └── popup.css
│   ├── dashboard/          # Dashboard page (React)
│   │   ├── Dashboard.jsx
│   │   ├── main.jsx
│   │   ├── index.html
│   │   └── dashboard.css
│   ├── content/            # Content script (Plain JS)
│   │   └── content.js      # Page scanning & form interaction
│   └── background/         # Service worker
│       ├── background.js   # Main background logic
│       └── services/
│           ├── ollamaService.js    # Ollama API integration
│           └── storageService.js   # Storage utilities
├── manifest.json           # Chrome extension manifest
├── vite.config.js         # Vite build configuration
└── package.json
```

## How It Works

1. **Form Detection**: Content script scans pages for job application forms
2. **Field Analysis**: Background worker analyzes each field using:
   - Local LLM (Ollama) for intelligent understanding
   - Rule-based fallback for reliability
3. **Smart Suggestions**: Matches fields to user profile data
4. **User Control**: User reviews and approves all autofills
5. **Learning**: Stores successful patterns for future improvements

## Ollama Integration

The extension sends form field context to your local Ollama instance:

```javascript
// Example prompt sent to Ollama
{
  "field": "First Name",
  "type": "text",
  "userProfile": { "fullName": "John Doe" },
  "context": "Job Application - Software Engineer"
}

// Ollama responds with:
{
  "category": "name",
  "suggestedValue": "John",
  "confidence": "high"
}
```

**Privacy Note**: All requests are sent to `localhost:11434` (your local machine). No data leaves your computer.

## Future Enhancements

- [ ] Resume parsing and storage
- [ ] Cover letter generation
- [ ] Multi-step form support
- [ ] Interview tracking
- [ ] Company research integration
- [ ] Optional Azure backend for cloud sync
- [ ] Browser automation for one-click applications

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Security & Privacy

- All user data stored locally using Chrome Storage API
- Ollama runs locally on your machine
- No data sent to external servers (unless you add Azure backend)
- You control what information is shared with forms

## Troubleshooting

### Ollama not connecting?
- Make sure Ollama is running: `ollama serve`
- Check if it's accessible: visit `http://localhost:11434`
- The extension will fall back to rule-based matching if Ollama is unavailable

### Extension not detecting forms?
- Make sure the extension is enabled (click icon and toggle on)
- Check if the site uses dynamic forms (they might load after page load)
- Try refreshing the page after enabling the extension

### Build errors?
- Delete `node_modules` and `dist` folders
- Run `npm install` again
- Make sure you're using Node.js v18 or higher

## Support

For issues and questions, please use the GitHub Issues page.

---

Built with ❤️ for job seekers everywhereBecause companys are using AI before reading resumes
