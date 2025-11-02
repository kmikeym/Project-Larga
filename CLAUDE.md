# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Larga** is a Story Development Tracker MVP designed for screenwriters and creative professionals who need to track the evolution of projects through 150+ documents, multiple drafts, notes from collaborators, and revisions over years.

**Current Status**: MVP implemented and functional. Alan Moore-style Story Grid tracking character evolution through document sections. AI-only character extraction with enhanced prompts.

## Target Use Case: "The Kathryn Workflow"

This app is specifically designed for screenwriters who:
- Create many drafts and revisions (10+ versions)
- Receive notes from multiple sources (producers, agents, etc.)
- Need to track what changed between versions
- Want to see project evolution over time (2+ years of development)

## Core Architecture (Planned)

### Technology Stack
- **Backend**: Node.js with Express ✅ IMPLEMENTED
- **Document Processing**: Mammoth.js (.docx), pdf-parse (.pdf), rtf-parser (.rtf) ✅ IMPLEMENTED
- **Frontend**: Vanilla JavaScript with monochrome grid design ✅ IMPLEMENTED
- **Storage**: File-based JSON ✅ IMPLEMENTED
- **Deployment**: Railway (planned)
- **AI Integration**: OpenRouter with GPT-4o ✅ IMPLEMENTED

### Data Flow
```
User uploads .docx → Mammoth extracts text → Parser analyzes content →
Metadata stored → Timeline updated → Analysis displayed
```

## Key Features (Iterative Development)

### Phase 1: MVP (Foundation) ✅ COMPLETE
- Multi-format document upload (.docx, .pdf, .rtf)
- Automatic metadata parsing from filename dates (YY_MM_DD format)
- Timeline grid visualization with monochrome design
- Content analysis: sections, characters, themes
- Document type classification (pitch/notes/draft/outline)
- AI-powered document analysis (summary, genre extraction)
- **Story Grid: Character × Section matrix (Alan Moore BIG NUMBERS style)**
  - Characters in rows, document sections in columns
  - Editable cells for character actions/notes per section
  - Drag-and-drop character reordering
  - Auto-save with visual status indicators
- Theme evolution tracking across documents
- Basic statistics dashboard
- **AI-Only Character Extraction** (no regex, increased 25k char context)
- **Re-analyze button** for updating AI analysis on existing documents

**Date Intelligence**: Handles filename patterns like `22_08_10_Shares_Pitch.docx` → Aug 10, 2022

### Phase 2: Draft Comparison ✅ COMPLETE
- Two-document comparison with selection UI
- Character/theme change tracking (added/removed)
- Section-level structural changes
- Word count evolution statistics
- AI-generated comparison briefs explaining why/how changes occurred
- Thematic shift analysis with percentages

### Phase 2.5: Multi-Project Support ✅ COMPLETE
- Project folder system for multiple shows/scripts
- Per-project data isolation (documents, uploads, settings)
- Project switcher UI in all pages
- Project management page (create/delete/view projects)
- Customizable AI prompts per project and document type
- Per-type model selection (GPT-4o, Claude, Gemini, etc.)

### Phase 3: Notes Integration
**Trigger**: First notes/feedback document uploaded
- Note attribution system (track who gave what feedback)
- Response tracking (which notes were addressed in which draft)
- Success rate analysis by note-giver

### Phase 4: GitHub Integration
**Trigger**: Need for collaboration/version control
- GitHub OAuth authentication
- Automatic private repo creation per project
- Two-way file synchronization
- Commit tracking and history

### Phase 5: AI Analysis
**Trigger**: Complex analysis needs
- OpenRouter integration with Claude 3.5 Sonnet
- Continuity checking across documents
- Character arc analysis
- Plot hole detection
- Automated suggestion generation

## Document Processing Pipeline

### Text Extraction
```javascript
// Mammoth.js extracts raw text from .docx files
const result = await mammoth.extractRawText({ path: filePath });
```

### Metadata Parsing
```javascript
// Example output from "22_08_10_Shares_Pitch.docx"
{
  filename: "22_08_10_Shares_Pitch.docx",
  date: "2022-08-10",           // Parsed from filename
  type: "pitch",                 // Classified by content
  wordCount: 3502,
  sections: [...],               // Uppercase headers detected
  characters: [...],             // ALL-CAPS names extracted
  themes: [...]                  // Keyword analysis
}
```

### Content Analysis Algorithms
- **Section Detection**: Finds uppercase headers (e.g., "INTRO AND THEME", "LOGLINE/TONE/REFERENCES")
- **Character Extraction**: Identifies ALL-CAPS words as character names, filters common words
- **Theme Identification**: Keyword analysis for thematic patterns
- **Document Type Classification**: pitch/notes/draft/outline based on content patterns

## File Structure

```
larga/
├── server.js              # Main Express application ✅
├── package.json           # Dependencies ✅
├── .env                   # OpenRouter API key (git-ignored)
├── public/
│   ├── index.html        # Timeline view with grid layout ✅
│   ├── compare.html      # Document comparison view ✅
│   ├── grid.html         # Story grid visualization ✅
│   ├── projects.html     # Project management page ✅
│   └── project-utils.js  # Shared project utilities ✅
├── uploads/              # User-uploaded documents (runtime, git-ignored)
├── projects/             # Multi-project data storage (runtime, git-ignored)
│   └── {projectId}/
│       ├── project-data.json      # Document metadata and analysis
│       ├── project-meta.json      # Project name, description, stats
│       ├── project-settings.json  # AI prompts and settings
│       └── uploads/               # Project-specific uploaded files
├── Ref/                  # Reference materials
│   └── Alan Moore's Schematic for BIG NUMBERS.jpg
├── CLAUDE.md            # This file
└── .gitignore           # Excludes: node_modules/, uploads/, projects/, .env
```

## Development Commands (When Implemented)

```bash
# Installation
npm install

# Local development
npm start                 # Starts server on localhost:3000
npm run dev              # Development mode with hot reload

# Testing
npm test                 # Run test suite (when added)

# Deployment
railway up               # Deploy to Railway
railway logs             # View production logs
```

## API Endpoints

```
POST   /api/upload                       # Upload and process document ✅
DELETE /api/documents/:id                # Delete document ✅
POST   /api/documents/:id/analyze        # AI analysis of document ✅
GET    /api/timeline                     # Get chronological timeline with stats ✅
GET    /api/compare/:id1/:id2            # Compare two documents ✅
GET    /api/story-grid                   # Get character/theme matrix ✅
GET    /api/projects                     # List all projects ✅
POST   /api/projects                     # Create new project ✅
DELETE /api/projects/:id                 # Delete project ✅
GET    /api/projects/:id/settings        # Get project AI settings ✅
POST   /api/projects/:id/settings        # Save project AI settings ✅
GET    /api/health                       # Health check ✅
```

All document/timeline/grid endpoints use the `X-Project-Id` header for multi-project isolation.

## Document Naming Convention

Expected chronological pattern:
```
22_08_10_Shares_Pitch.docx                    # YY_MM_DD_Title.docx
23_04_16_PUBLICLY_OWNED.docx                  # Next version
23_04_28_PUBLICLY_OWNED_FOR_TODAY.docx        # Revision
23_04_30_Publicly_Owned_Notes.docx            # Feedback
```

Supports variations: `220810`, `23.04.16`, or falls back to file creation date.

## Design Principles

### Iterative Development
Build features **only when triggered by real user needs**. Don't build comparison features until there's a second document to compare. Don't build notes tracking until there are actual notes to track.

### Real Data First
Designed to handle actual creative workflows:
- Inconsistent naming conventions
- Various document types (.docx, .pages, .pdf in future)
- Long development timelines (2+ years)
- Large document counts (150+ files)

### Progressive Enhancement
- Start with file-based storage (easy to debug)
- Upgrade to PostgreSQL when relationships become complex
- Start with vanilla JS frontend (fast MVP)
- Add React when UI interactions become complex
- Start with basic text analysis
- Add AI when analysis needs become sophisticated

## Future Integration Points

### OpenRouter Configuration
```javascript
// Phase 5: AI analysis integration
const analysis = await openrouter.chat.completions.create({
  model: "anthropic/claude-3.5-sonnet",
  messages: [{
    role: "user",
    content: `Analyze this script for continuity issues: ${documentText}`
  }]
});
```

### GitHub OAuth Flow
```javascript
// Phase 4: Authentication and repo management
app.get('/auth/github', passport.authenticate('github'));
app.post('/api/create-project-repo', createPrivateRepo);
```

## Reference Materials

- **README_DRAFT.md**: User-facing documentation, deployment instructions
- **TECHNICAL_OVERVIEW_DRAFT.md**: Detailed architecture and implementation guide
- **Ref/Alan Moore's Schematic for BIG NUMBERS.jpg**: Inspiration for complex narrative tracking

## Starting Point

When beginning implementation, start with the first real document:
- **22_08_10_Shares_Pitch.docx** - Initial TV series pitch (3,502 words)
- This proves the core concept: upload, extract, analyze, display
- All other features are built iteratively from this foundation

## Key Technical Decisions

**File-based storage initially**: Simple, portable, version-controllable, easy to debug
**Vanilla JS frontend initially**: No framework overhead, fast MVP development
**Node.js backend**: Rich ecosystem (Mammoth, Multer), JavaScript everywhere
**Railway deployment**: Simple hosting with GitHub integration
**Iterative AI integration**: Only add when basic features prove valuable

## Current Implementation Status

### What Works Now
1. **Multi-format Upload**: .docx, .pdf, .rtf document processing
2. **Timeline View**: Monochrome grid layout showing all documents chronologically
3. **Story Grid**: Alan Moore-style character × document matrix tracking evolution
4. **Document Comparison**: Side-by-side analysis with AI-generated briefs
5. **AI Analysis**: GPT-4o powered summaries and genre classification
6. **Smart Classification**: Automatic detection of pitch/notes/draft/outline documents
7. **Multi-Project Support**: Work on multiple shows/scripts with isolated data
8. **Customizable AI Prompts**: Per-project, per-document-type prompt and model customization
9. **Character Reordering**: Drag-and-drop to reorder characters in Story Grid

### Known Limitations
- .pages files not supported (macOS package bundles - users must export to PDF/DOCX)
- Character extraction based on ALL-CAPS words (screenplay convention)
- Theme extraction uses simple keyword analysis (could be more sophisticated)
- No user authentication (local/single-user deployment)

## Next Steps (Priority Order)

### Immediate (MVP Enhancement)
1. **Enhanced Story Grid Analysis**
   - Add plot beat tracking across documents
   - Identify story structure patterns (setup, conflict, resolution)
   - Track character relationship evolution
   - Map plot threads that appear/disappear

2. **Pitch Document Deep Analysis**
   - Extract and structure: logline, genre, tone, comps
   - Character relationship mapping
   - Thematic promise identification
   - Market positioning analysis

3. **Better Character Extraction**
   - Handle non-screenplay formats (novels, treatments)
   - Distinguish between main/supporting characters
   - Track character mentions (not just presence/absence)
   - Character arc progression tracking

### Phase 3: Notes Integration (When Needed)
- Note attribution system (track who gave what feedback)
- Response tracking (which notes were addressed in which draft)
- Success rate analysis by note-giver
- Notes-to-changes correlation

### Phase 4: Deployment & Sharing
- Railway deployment configuration
- GitHub integration for version control
- Export functionality (PDF reports, CSV data)
- Collaboration features (share projects with team members)

### Phase 5: Advanced AI Features (Future)
- Continuity checking across documents
- Plot hole detection
- Character arc analysis
- Automated suggestion generation
- Screenplay formatting validation

## Development Notes

### AI Model Choice
Default model is `openai/gpt-4o` via OpenRouter to avoid moderation issues with creative content. Users can now customize AI models per document type (notes, beat sheets, session notes) in project settings. Supported models include GPT-4o, Claude 3.5 Sonnet, Claude 3 Opus, and Gemini Pro 1.5.

### AI Character Extraction
**Recent Change**: Character extraction now uses **AI-only** approach (no regex fallback):
- Regex extraction (`extractCharacters()`) disabled during upload - characters default to `[]`
- AI analysis prompt explicitly instructs to extract ALL characters (main, supporting, minor)
- Context window increased from 4,000 to 25,000 characters to capture full documents
- "🤖 Analyze" button always visible as "Analyze" or "Re-analyze" for updating extractions
- Prompt includes specific examples and emphasizes thoroughness

**Why**: Regex-based ALL-CAPS extraction missed mixed-case character names and only caught characters in the first 4k chars. AI extraction is comprehensive and context-aware.

### AI Prompt Customization
Users can customize AI analysis prompts per project and document type. Template variables available:
- `{filename}` - Document filename
- `{text}` - Document text (now up to 25,000 chars, was 4,000)
- `{documentType}` - Classified document type
- `{expectedContent}` - Expected content based on document type

Settings stored in `projects/{projectId}/project-settings.json`.

### Design Philosophy
The interface uses a minimalist monochrome design inspired by https://chloelouise.design/:
- #fafafa background
- #111 text and buttons
- #e0e0e0 borders and dividers
- 1px gaps in grids creating table-like separation
- No gradients, shadows, or rounded corners
- Information-dense layout prioritizing content over decoration
