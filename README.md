# Larga - Story Development Tracker

An iterative story development app designed to track the evolution of creative projects through multiple drafts, notes, and revisions over time.

## Quick Start

```bash
# Install dependencies
npm install

# (Optional) Configure OpenRouter for AI-powered analysis
cp .env.example .env
# Edit .env and add your OpenRouter API key

# Start the server
npm start

# Open in browser
open http://localhost:3000
```

## Features

### Document Processing
- Automatic text extraction from .docx files
- Metadata parsing from filename dates (e.g., `22_08_10_Shares_Pitch.docx`)
- Document type classification (pitch, notes, draft, outline)
- Section detection and analysis

### Timeline Tracking
- Chronological visualization of project evolution
- Document statistics and progress tracking
- Character and theme extraction across documents

### Content Analysis
- Section breakdown with word counts
- Character name extraction (ALL-CAPS detection or AI-powered)
- Theme identification from content (keyword-based or AI-powered)
- AI-generated summaries and genre classification (when OpenRouter configured)
- Project-wide statistics

### AI Enhancement (Optional)
When you configure an OpenRouter API key, Larga uses Claude 3.5 Sonnet to:
- Extract character names with context understanding (avoids false positives)
- Identify major themes and story elements
- Generate one-sentence summaries of documents
- Classify genre automatically
- Documents processed with AI show a "🤖 AI Enhanced" badge

## Tech Stack

- **Backend**: Node.js, Express
- **Document Processing**: Mammoth.js
- **Frontend**: Vanilla JavaScript
- **Storage**: File-based JSON (upgradeable to PostgreSQL)

## Deployment

### Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway up
```

The app will automatically deploy from the main branch.

## Iterative Development

This is an MVP designed to grow with your needs:
- **Phase 1 (Current)**: Document upload, timeline, content analysis
- **Phase 2**: Draft comparison with text diffs
- **Phase 3**: Notes integration and tracking
- **Phase 4**: GitHub OAuth and repo sync
- **Phase 5**: AI analysis with OpenRouter/Claude

## API Endpoints

```
POST   /api/upload          - Upload and process .docx document
GET    /api/documents       - List all documents
GET    /api/documents/:id   - Get specific document details
GET    /api/timeline        - Get timeline with stats
GET    /api/health          - Health check
```

## Project Structure

```
larga/
├── server.js           - Main Express application
├── public/
│   └── index.html     - Frontend interface
├── uploads/           - Uploaded documents (runtime)
├── projects/          - Project data storage (runtime)
├── railway.json       - Railway deployment config
└── CLAUDE.md          - Development guidance
```

## License

MIT
