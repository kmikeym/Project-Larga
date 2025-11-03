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

### Multi-Project Support
- Work on multiple shows/scripts simultaneously
- Per-project data isolation (documents, uploads, settings)
- Project switcher in navigation
- Create, manage, and delete projects

### Document Processing
- Automatic text extraction from .docx, .pdf, .rtf files
- Metadata parsing from filename dates (e.g., `22_08_10_Shares_Pitch.docx`)
- Document type classification (pitch, notes, draft, outline)
- Section detection and analysis

### Timeline Tracking
- Chronological visualization of project evolution
- Document statistics and progress tracking
- Character and theme extraction across documents

### Story Grid (Alan Moore BIG NUMBERS Style)
- **Character × Section matrix** for deep document analysis
- Automatically displays after AI analysis (no separate "Update Grid" step)
- Sections become columns (INTRO, ACT ONE, etc.), characters become rows
- Editable cells for character actions/notes per section
- Drag-and-drop character reordering
- Auto-save with visual status indicators (1-second debounce)
- Inspired by Alan Moore's handwritten story schematics for BIG NUMBERS

### Document Comparison
- Side-by-side comparison of any two documents
- Character/theme change tracking (added/removed)
- AI-generated comparison briefs
- Word count and structural evolution

### Content Analysis
- Section breakdown with word counts
- **AI-powered character extraction** (all character names, regardless of capitalization)
- Theme identification from content
- AI-generated summaries and genre classification
- Project-wide statistics
- **Re-analyze button** for updating AI analysis on existing documents

### AI Enhancement (Customizable)
Customizable AI prompts per project and document type:
- **Model Selection**: Choose GPT-4o, Claude 3.5 Sonnet, Claude 3 Opus, or Gemini Pro per document type
- **Custom Prompts**: Edit AI analysis prompts for notes, beat sheets, session notes, and default documents
- **Template Variables**: Use `{filename}`, `{text}`, `{documentType}`, `{expectedContent}` in prompts
- **Per-Project Settings**: Each project maintains its own AI configuration
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
- **Phase 1**: Document upload, timeline, content analysis ✅
- **Phase 2**: Draft comparison with text diffs ✅
- **Phase 2.5**: Multi-project support with customizable AI ✅
- **Phase 3**: Notes integration and tracking (planned)
- **Phase 4**: GitHub OAuth and repo sync (planned)
- **Phase 5**: Advanced AI features (continuity checking, plot holes) (planned)

## API Endpoints

```
POST   /api/upload                       - Upload and process document
DELETE /api/documents/:id                - Delete document
POST   /api/documents/:id/analyze        - AI analysis of document
GET    /api/timeline                     - Get chronological timeline with stats
GET    /api/compare/:id1/:id2            - Compare two documents
GET    /api/story-grid                   - Get character/theme matrix
GET    /api/projects                     - List all projects
POST   /api/projects                     - Create new project
DELETE /api/projects/:id                 - Delete project
GET    /api/projects/:id/settings        - Get project AI settings
POST   /api/projects/:id/settings        - Save project AI settings
GET    /api/health                       - Health check
```

All document endpoints use the `X-Project-Id` header for multi-project isolation.

## Project Structure

```
larga/
├── server.js           - Main Express application
├── public/
│   ├── index.html     - Timeline view
│   ├── compare.html   - Document comparison
│   ├── grid.html      - Story grid visualization
│   ├── projects.html  - Project management
│   └── project-utils.js - Shared project utilities
├── uploads/           - Uploaded documents (runtime, deprecated)
├── projects/          - Multi-project data storage (runtime)
│   └── {projectId}/
│       ├── project-data.json      - Document metadata
│       ├── project-meta.json      - Project info
│       ├── project-settings.json  - AI settings
│       └── uploads/               - Project files
├── railway.json       - Railway deployment config
└── CLAUDE.md          - Development guidance
```

## License

MIT
