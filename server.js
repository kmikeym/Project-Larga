require('dotenv').config();

const express = require('express');
const mammoth = require('mammoth');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
const OpenAI = require('openai');
const Diff = require('diff');
const pdfParse = require('pdf-parse');
const rtfParser = require('rtf-parser');
const { DOCUMENT_TYPES, classifyDocument, getDocumentTypeStyle } = require('./document-types');

const app = express();
const PORT = process.env.PORT || 3000;

// OpenRouter configuration (optional - falls back to regex if no API key)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const openai = OPENROUTER_API_KEY ? new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://larga.app",
    "X-Title": "Larga Story Tracker"
  }
}) : null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Helper function to get project paths
function getProjectPaths(projectId) {
  const projectDir = path.join(PROJECTS_DIR, projectId);
  return {
    projectDir,
    uploadsDir: path.join(projectDir, 'uploads'),
    dataPath: path.join(projectDir, 'project-data.json'),
    metaPath: path.join(projectDir, 'project-meta.json')
  };
}

// Middleware to extract project ID from request
function getProjectId(req) {
  // Check header first (preferred method)
  if (req.headers['x-project-id']) {
    return req.headers['x-project-id'];
  }

  // Check query parameter as fallback
  if (req.query.projectId) {
    return req.query.projectId;
  }

  // For backwards compatibility, use legacy path
  return 'default';
}

// Ensure required directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PROJECTS_DIR = path.join(__dirname, 'projects');
fs.ensureDirSync(PROJECTS_DIR);

// Migration: Move legacy project-data.json to default project folder
async function migrateLegacyProject() {
  const legacyDataPath = path.join(PROJECTS_DIR, 'project-data.json');
  const legacyUploadsDir = UPLOADS_DIR;

  // Check if legacy project-data.json exists at old location
  if (await fs.pathExists(legacyDataPath)) {
    console.log('📦 Migrating legacy project data to default project...');

    const defaultPaths = getProjectPaths('default');

    try {
      // Create default project directory
      await fs.ensureDir(defaultPaths.projectDir);
      await fs.ensureDir(defaultPaths.uploadsDir);

      // Move project-data.json
      await fs.move(legacyDataPath, defaultPaths.dataPath, { overwrite: false });

      // Move uploads directory contents
      if (await fs.pathExists(legacyUploadsDir)) {
        const files = await fs.readdir(legacyUploadsDir);
        for (const file of files) {
          const oldPath = path.join(legacyUploadsDir, file);
          const newPath = path.join(defaultPaths.uploadsDir, file);
          await fs.move(oldPath, newPath, { overwrite: false });
        }
      }

      // Create project metadata
      const metadata = {
        id: 'default',
        name: 'Default Project',
        description: 'Migrated from legacy data',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await fs.writeJSON(defaultPaths.metaPath, metadata, { spaces: 2 });

      console.log('✅ Migration complete! Legacy data moved to projects/default/');
    } catch (error) {
      console.error('❌ Migration error:', error.message);
    }
  }
}

// Run migration on startup
migrateLegacyProject().catch(console.error);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    // Ensure project directories exist
    try {
      await fs.ensureDir(paths.uploadsDir);
      cb(null, paths.uploadsDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/pdf', // .pdf
      'application/rtf', // .rtf
      'text/rtf' // .rtf (alternative)
    ];

    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.docx', '.pdf', '.rtf'];

    // Special message for .pages files
    if (ext === '.pages') {
      cb(new Error('.pages files are not supported. Please export your document to PDF or DOCX from Pages first.'));
      return;
    }

    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .docx, .pdf, and .rtf files are supported'));
    }
  }
});

// Helper function to extract text from different file formats
async function extractTextFromFile(filePath, filename) {
  const ext = path.extname(filename).toLowerCase();

  try {
    switch (ext) {
      case '.docx':
        const docxResult = await mammoth.extractRawText({ path: filePath });
        return docxResult.value;

      case '.pdf':
        const pdfBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(pdfBuffer);
        return pdfData.text;

      case '.rtf':
        return new Promise((resolve, reject) => {
          const stream = fs.createReadStream(filePath);
          let text = '';

          rtfParser.stream(stream, (err, doc) => {
            if (err) {
              reject(err);
            } else {
              // Extract text content from RTF document
              const extractText = (node) => {
                if (node.content) {
                  node.content.forEach(item => {
                    if (typeof item === 'string') {
                      text += item;
                    } else if (item.content) {
                      extractText(item);
                    }
                  });
                }
              };
              extractText(doc);
              resolve(text);
            }
          });
        });

      case '.pages':
        // .pages files are actually packages (directories on macOS)
        // Try to extract from the Preview.pdf inside the package
        const pagesPreviewPath = path.join(filePath, 'QuickLook', 'Preview.pdf');

        if (await fs.pathExists(pagesPreviewPath)) {
          const pagesPdfBuffer = await fs.readFile(pagesPreviewPath);
          const pagesPdfData = await pdfParse(pagesPdfBuffer);
          return pagesPdfData.text;
        } else {
          // If no Preview.pdf, try to read index.xml (less reliable)
          throw new Error('.pages file format not fully supported. Please export to .docx or .pdf');
        }

      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  } catch (error) {
    console.error(`Error extracting text from ${ext}:`, error.message);
    throw new Error(`Failed to extract text from ${ext} file: ${error.message}`);
  }
}

// Helper function to parse date from filename
function parseDocumentDate(filename) {
  // Try patterns: YY_MM_DD, YYMMDD, YY.MM.DD
  const patterns = [
    /(\d{2})_(\d{2})_(\d{2})/,  // 22_08_10
    /(\d{2})(\d{2})(\d{2})/,     // 220810
    /(\d{2})\.(\d{2})\.(\d{2})/  // 22.08.10
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      const year = parseInt(`20${match[1]}`);
      const month = parseInt(match[2]) - 1; // JS months are 0-indexed
      const day = parseInt(match[3]);
      return new Date(year, month, day);
    }
  }

  // Fallback to current date
  return new Date();
}

// Helper function to classify document type (using taxonomy from document-types.js)
function classifyDocumentType(filename, text) {
  return classifyDocument(filename, text);
}

// Helper function to extract sections from text
function extractSections(text) {
  const sections = [];
  const lines = text.split('\n');
  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check if line is likely a section header (uppercase, short, not empty)
    if (trimmedLine.length > 0 &&
        trimmedLine.length < 100 &&
        trimmedLine === trimmedLine.toUpperCase() &&
        /^[A-Z\s/:&-]+$/.test(trimmedLine)) {

      // Save previous section if exists
      if (currentSection) {
        sections.push({
          title: currentSection,
          content: currentContent.join('\n').trim(),
          wordCount: currentContent.join(' ').split(/\s+/).filter(w => w.length > 0).length
        });
      }

      // Start new section
      currentSection = trimmedLine;
      currentContent = [];
    } else if (currentSection && trimmedLine.length > 0) {
      currentContent.push(line);
    }
  }

  // Add final section
  if (currentSection) {
    sections.push({
      title: currentSection,
      content: currentContent.join('\n').trim(),
      wordCount: currentContent.join(' ').split(/\s+/).filter(w => w.length > 0).length
    });
  }

  return sections;
}

// Helper function to extract character names
// DEPRECATED: This regex-based extraction is no longer used.
// Characters are now ONLY extracted via AI analysis for better accuracy.
// Keeping this function for reference but it's not called during document upload.
function extractCharacters(text) {
  const characters = new Set();
  const words = text.split(/\s+/);

  // Common words to filter out (expanded for screenplays)
  const stopWords = new Set([
    'THE', 'AND', 'OR', 'BUT', 'IN', 'ON', 'AT', 'TO', 'FOR',
    'OF', 'WITH', 'BY', 'FROM', 'UP', 'ABOUT', 'INTO', 'THROUGH',
    'DURING', 'BEFORE', 'AFTER', 'ABOVE', 'BELOW', 'BETWEEN',
    'INTRO', 'THEME', 'LOGLINE', 'TONE', 'REFERENCES', 'NOTES',
    'DRAFT', 'PITCH', 'OUTLINE', 'EPISODE', 'SCENE', 'ACT',
    // Screenplay/document specific
    'PILOT', 'SERIES', 'FINALE', 'TEASER', 'CLOSING', 'EPISODES',
    'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH',
    'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
    'DAY', 'NIGHT', 'INT', 'EXT', 'POV', 'CONT', 'VO', 'OS',
    'HIS', 'HER', 'HAS', 'HAD', 'WAS', 'WERE', 'CAN', 'WILL', 'THAT', 'THIS',
    'GET', 'GOT', 'GAVE', 'TAKE', 'TAKES', 'NEED', 'USE', 'BECOME',
    'HERE', 'THERE', 'MOST', 'OTHER', 'WORLD', 'MOMENT', 'REASON',
    'PAGES', 'PROJECT', 'BUSINESS', 'PROBLEM', 'SHAPE', 'SKILL',
    // Placeholders
    'TKTKTK', 'TKTKTKTK', 'TBD', 'TBA',
    // Your specific document words
    'PUBLICLY', 'OWNED', 'SHARES', 'IPO', 'INTERNATIONAL', 'ROMANCE',
    'VASECTOMY', 'BAG', 'ARC', 'THREAD', 'DNA', 'DIY', 'HARD', 'SMASH',
    'BATEMAN', 'INTRODUCED'
  ]);

  for (const word of words) {
    const cleaned = word.replace(/[^A-Z]/g, '');

    // Character name criteria: 3-15 chars, all uppercase, not a stop word
    if (cleaned.length >= 3 &&
        cleaned.length <= 15 &&
        cleaned === word &&
        !stopWords.has(cleaned)) {
      characters.add(cleaned);
    }
  }

  return Array.from(characters).sort();
}

// Helper function to extract themes
function extractThemes(text) {
  const themeKeywords = [
    'identity', 'masculinity', 'femininity', 'community', 'family',
    'power', 'control', 'freedom', 'justice', 'revenge', 'love',
    'betrayal', 'loyalty', 'ambition', 'greed', 'sacrifice',
    'redemption', 'corruption', 'truth', 'deception', 'survival'
  ];

  const lowerText = text.toLowerCase();
  const themes = [];

  for (const keyword of themeKeywords) {
    if (lowerText.includes(keyword)) {
      themes.push(keyword);
    }
  }

  return themes;
}

// AI-powered comparison brief
async function generateComparisonBrief(doc1, doc2, stats, text1Sample, text2Sample) {
  if (!openai) {
    return null;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "openai/gpt-4o",
      messages: [{
        role: "user",
        content: `Analyze the changes between two versions of a screenplay/story document and write a brief summary.

**Document 1** (${doc1.filename}, ${new Date(doc1.date).toLocaleDateString()}):
- ${doc1.wordCount} words
- Themes: ${doc1.themes.join(', ') || 'none detected'}
- Characters: ${doc1.characters.slice(0, 5).join(', ') || 'none detected'}

**Document 2** (${doc2.filename}, ${new Date(doc2.date).toLocaleDateString()}):
- ${doc2.wordCount} words
- Themes: ${doc2.themes.join(', ') || 'none detected'}
- Characters: ${doc2.characters.slice(0, 5).join(', ') || 'none detected'}

**Changes**:
- Word count: ${stats.wordCountChange >= 0 ? '+' : ''}${stats.wordCountChange}
- New themes: ${stats.newThemes.join(', ') || 'none'}
- Removed themes: ${stats.removedThemes.join(', ') || 'none'}
- New characters: ${stats.newCharacters.join(', ') || 'none'}
- Removed characters: ${stats.removedCharacters.join(', ') || 'none'}
- New sections: ${stats.newSections.map(s => s.title).join(', ') || 'none'}
- Removed sections: ${stats.removedSections.map(s => s.title).join(', ') || 'none'}

Text sample from Document 1 (first 500 chars):
${text1Sample}

Text sample from Document 2 (first 500 chars):
${text2Sample}

Write a 2-3 paragraph brief that explains:
1. What changed between these versions (the "what")
2. Why these changes likely occurred - what story/creative decisions drove them (the "why")
3. How the document evolved - did it expand, focus, pivot direction? (the "how")

Be specific and insightful. Focus on creative/narrative shifts, not just statistics.`
      }]
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('AI brief generation error:', error.message);
    return null;
  }
}

// Default AI Analysis Prompts (can be customized per-project)
const DEFAULT_AI_PROMPTS = {
  notes: {
    model: 'openai/gpt-4o',
    prompt: `You are analyzing NOTES/FEEDBACK on a screenplay or pitch. These are comments from producers, agents, or executives.

Document filename: {filename}

Full text of notes:
{text}

Read the actual notes above and extract:

1. "characters": Character names mentioned in the feedback (NOT the names of people giving feedback)
2. "themes": The story/creative topics discussed in the notes (e.g., "protagonist arc", "pacing", "tone", "world-building")
3. "summary": Write ONE sentence describing the MAIN CREATIVE CONCERNS or suggestions in these notes. Read the actual feedback and summarize what they're asking for.

Examples of GOOD summaries:
- "Notes emphasize the need for a stronger antagonist and clearer stakes in Act 2"
- "Feedback focuses on making the protagonist more likeable and the tone less dark"
- "Executive requests more distinctive world-building and faster pacing in the cold open"

Examples of BAD summaries (DO NOT write these):
- "The document contains feedback and suggestions" ❌
- "Notes provide input on the project" ❌
- "Document includes praise and concerns" ❌

4. "genre": If notes mention the genre, include it; otherwise null
5. "notesFrom": Who gave these notes? (look for names/titles)
6. "actionItems": Specific changes requested (quoted from the notes if possible)

Read the notes carefully and be specific about what they actually say.

Return only valid JSON, no additional text.`
  },
  beatSheet: {
    model: 'openai/gpt-4o',
    prompt: `Analyze this BEAT SHEET document.

Document filename: {filename}

Text excerpt:
{text}

Expected content: {expectedContent}

Please provide a JSON response with:
1. "characters": Array of character names appearing in the beats
2. "themes": Array of major story themes/arcs (3-5 themes)
3. "summary": One sentence describing the overall story arc
4. "genre": The genre (e.g., "drama", "comedy", "thriller")
5. "structure": Description of the act structure (e.g., "Three-act structure with cold open")
6. "beatCount": Approximate number of beats/scenes

Return only valid JSON, no additional text.`
  },
  sessionNotes: {
    model: 'openai/gpt-4o',
    prompt: `Analyze this internal BRAINSTORMING/SESSION NOTE.

Document filename: {filename}

Text excerpt:
{text}

This is informal thinking/planning by the writer.

Please provide a JSON response with:
1. "characters": Array of character names mentioned (if any)
2. "themes": Array of topics/ideas being explored (3-5)
3. "summary": One sentence capturing the main thinking/ideas
4. "genre": If genre is mentioned, include it; otherwise null
5. "questions": Array of questions the writer is exploring (if identifiable)

Return only valid JSON, no additional text.`
  },
  default: {
    model: 'openai/gpt-4o',
    prompt: `Analyze this {documentType} document.

Document filename: {filename}

Text excerpt:
{text}

Expected content: {expectedContent}

Please provide a JSON response with:

1. "characters": Array of ALL character names found in this document.
   - For screenplays/pitches: Include ALL character names mentioned (main characters, supporting characters, minor characters)
   - Look for names in ALL-CAPS (screenplay format) AND mixed-case mentions
   - Include first names, full names, or descriptive names (e.g., "BO", "Max", "DOCTOR LARRY", "Junior Pastor Kurt")
   - Return as array of strings: ["Bo", "Max", "Cherie", "Larry", "Dolly", "Eddie", "Sarah", "Kurt", "Michelle", "Maia"]
   - If no characters found, return empty array: []

2. "themes": Array of major themes (3-5 themes)

3. "summary": One sentence summary of the document

4. "genre": The genre (e.g., "drama", "comedy", "thriller")

IMPORTANT: Extract ALL character names you find, not just the main ones. Be thorough.

Return only valid JSON, no additional text.`
  }
};

// AI-powered content analysis (optional, uses OpenRouter if configured)
async function analyzeContentWithAI(text, filename, documentType = 'unclassified', model = 'openai/gpt-4o', projectId = 'default') {
  if (!openai) {
    return null; // Fall back to regex-based extraction
  }

  try {
    // If unclassified, first determine the document type
    let detectedType = documentType;
    if (documentType === 'unclassified') {
      const typeClassification = await classifyDocumentWithAI(text, filename, model);
      if (typeClassification) {
        detectedType = typeClassification;
      }
    }

    // Load project-specific AI settings
    const settingsPath = path.join(PROJECTS_DIR, projectId, 'project-settings.json');
    let aiPrompts = DEFAULT_AI_PROMPTS;

    if (await fs.pathExists(settingsPath)) {
      try {
        const settings = await fs.readJSON(settingsPath);
        if (settings.aiPrompts) {
          aiPrompts = settings.aiPrompts;
        }
      } catch (error) {
        console.warn(`Failed to load project settings for ${projectId}, using defaults:`, error.message);
      }
    }

    // Select the appropriate prompt config based on document type
    let promptConfig;
    if (detectedType === 'notes') {
      promptConfig = aiPrompts.notes || DEFAULT_AI_PROMPTS.notes;
    } else if (detectedType === 'beatSheet') {
      promptConfig = aiPrompts.beatSheet || DEFAULT_AI_PROMPTS.beatSheet;
    } else if (detectedType === 'sessionNotes' || detectedType === 'quickNote') {
      promptConfig = aiPrompts.sessionNotes || DEFAULT_AI_PROMPTS.sessionNotes;
    } else {
      promptConfig = aiPrompts.default || DEFAULT_AI_PROMPTS.default;
    }

    // Use the model specified in the prompt config, not the passed-in parameter
    const selectedModel = promptConfig.model;

    // Get document type info for template variables
    const typeInfo = DOCUMENT_TYPES[detectedType];
    const typeName = typeInfo ? typeInfo.name : 'Document';
    const expectedContent = typeInfo ? typeInfo.expectedContent.join(', ') : '';

    // Replace template variables in the prompt
    // Send more text to capture all characters (up to ~25,000 chars / ~6,000 tokens)
    const analysisPrompt = promptConfig.prompt
      .replace(/{filename}/g, filename)
      .replace(/{text}/g, text.substring(0, 25000))
      .replace(/{documentType}/g, typeName.toUpperCase())
      .replace(/{expectedContent}/g, expectedContent);

    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [{
        role: "user",
        content: analysisPrompt
      }],
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    analysis.model = selectedModel; // Track which model was used
    analysis.detectedType = detectedType; // Include the detected document type
    return analysis;
  } catch (error) {
    console.error('AI analysis error:', error.message);
    console.error('Full error:', error);

    // Check if this is a moderation/content policy error
    if (error.message && (
      error.message.includes('content policy') ||
      error.message.includes('moderation') ||
      error.message.includes('harmful') ||
      error.message.includes('blocked') ||
      error.status === 400
    )) {
      // If using Claude, suggest GPT-4o as fallback
      if (error.message.includes('claude') || error.message.includes('anthropic')) {
        throw new Error('Claude content moderation blocked this request. This often happens with creative/dramatic content. Please switch to GPT-4o in Settings, which has more relaxed moderation for fictional content.');
      } else {
        throw new Error('Content moderation blocked this request. Your creative content may have triggered safety filters. Try using GPT-4o which is better for fictional TV/film content.');
      }
    }

    throw error; // Re-throw other errors
  }
}

// AI-powered document type classification
async function classifyDocumentWithAI(text, filename, model = 'openai/gpt-4o') {
  if (!openai) {
    return null;
  }

  try {
    const availableTypes = Object.keys(DOCUMENT_TYPES)
      .filter(key => key !== 'unclassified')
      .map(key => {
        const type = DOCUMENT_TYPES[key];
        return `- ${key}: ${type.description}`;
      })
      .join('\n');

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [{
        role: "user",
        content: `Classify this document into one of the following types:

${availableTypes}

Document filename: ${filename}

Text excerpt (first 2000 chars):
${text.substring(0, 2000)}

Return ONLY the type key (e.g., "pitch", "notes", "beatSheet", etc.), nothing else.`
      }]
    });

    const detectedType = completion.choices[0].message.content.trim().toLowerCase();

    // Validate the detected type exists
    if (DOCUMENT_TYPES[detectedType]) {
      return detectedType;
    }

    return 'pitch'; // Fallback to pitch if invalid
  } catch (error) {
    console.error('AI classification error:', error.message);

    // Check for moderation errors
    if (error.message && (
      error.message.includes('content policy') ||
      error.message.includes('moderation') ||
      error.message.includes('harmful') ||
      error.message.includes('blocked') ||
      error.status === 400
    )) {
      if (model.includes('claude') || model.includes('anthropic')) {
        throw new Error('Claude moderation blocked document classification. Switch to GPT-4o in Settings for fictional/dramatic content.');
      }
    }

    return 'pitch'; // Fallback
  }
}

// API Routes

// Upload and process document
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const originalFilename = req.file.originalname;

    // Extract text from document (supports .docx, .pdf, .rtf, .pages)
    const text = await extractTextFromFile(filePath, originalFilename);

    // Parse metadata
    const date = parseDocumentDate(originalFilename);
    const type = 'unclassified'; // Don't classify until AI analysis
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

    // Analyze content with regex (AI analysis available on-demand)
    const sections = extractSections(text);
    const themes = extractThemes(text);

    // Create document object
    // NOTE: Characters are now ONLY extracted via AI analysis, not regex
    const document = {
      id: Date.now().toString(),
      filename: originalFilename,
      uploadedAt: new Date().toISOString(),
      date: date.toISOString(),
      type,
      wordCount,
      sections,
      characters: [], // Empty by default - populated by AI analysis
      themes,
      filePath: req.file.filename,
      aiEnhanced: false,
      summary: null,
      genre: null
    };

    // Get project-specific paths
    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    // Ensure project directories exist
    await fs.ensureDir(paths.projectDir);

    // Load or create project data
    let projectData = { documents: [] };

    if (await fs.pathExists(paths.dataPath)) {
      projectData = await fs.readJSON(paths.dataPath);
    }

    // Add document and sort by date
    projectData.documents.push(document);
    projectData.documents.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Save project data
    await fs.writeJSON(paths.dataPath, projectData, { spaces: 2 });

    res.json({
      success: true,
      document
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all documents
app.get('/api/documents', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      res.json(projectData.documents);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get document by ID
app.get('/api/documents/:id', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      const document = projectData.documents.find(d => d.id === req.params.id);

      if (document) {
        res.json(document);
      } else {
        res.status(404).json({ error: 'Document not found' });
      }
    } else {
      res.status(404).json({ error: 'Document not found' });
    }
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      const documentIndex = projectData.documents.findIndex(d => d.id === req.params.id);

      if (documentIndex !== -1) {
        const document = projectData.documents[documentIndex];

        // Delete the uploaded file
        const uploadPath = path.join(paths.uploadsDir, document.filePath);
        if (await fs.pathExists(uploadPath)) {
          await fs.remove(uploadPath);
        }

        // Remove from documents array
        projectData.documents.splice(documentIndex, 1);

        // Save updated data
        await fs.writeJSON(paths.dataPath, projectData, { spaces: 2 });

        res.json({ success: true, message: 'Document deleted' });
      } else {
        res.status(404).json({ error: 'Document not found' });
      }
    } else {
      res.status(404).json({ error: 'Document not found' });
    }
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analyze document with AI (on-demand)
app.post('/api/documents/:id/analyze', async (req, res) => {
  try {
    if (!openai) {
      return res.status(400).json({ error: 'AI analysis not available. Set OPENROUTER_API_KEY in .env' });
    }

    const requestedModel = req.body?.model || 'openai/gpt-4o'; // Get model from request body
    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      const document = projectData.documents.find(d => d.id === req.params.id);

      if (document) {
        // Load the original file to get full text
        const uploadPath = path.join(paths.uploadsDir, document.filePath);
        const text = await extractTextFromFile(uploadPath, document.filename);

        // Run AI analysis with document type context and selected model
        const aiAnalysis = await analyzeContentWithAI(text, document.filename, document.type, requestedModel);

        if (aiAnalysis) {
          // Update document with AI analysis
          document.characters = aiAnalysis.characters;
          document.themes = aiAnalysis.themes;
          document.summary = aiAnalysis.summary;
          document.genre = aiAnalysis.genre;
          document.aiEnhanced = true;
          document.aiModel = aiAnalysis.model; // Track which AI model was used

          // Update document type if it was classified
          if (aiAnalysis.detectedType) {
            document.type = aiAnalysis.detectedType;
          }

          // Store document-type-specific fields
          if (aiAnalysis.notesFrom) document.notesFrom = aiAnalysis.notesFrom;
          if (aiAnalysis.actionItems) document.actionItems = aiAnalysis.actionItems;
          if (aiAnalysis.questions) document.questions = aiAnalysis.questions;
          if (aiAnalysis.structure) document.structure = aiAnalysis.structure;
          if (aiAnalysis.beatCount) document.beatCount = aiAnalysis.beatCount;

          // Save updated data
          await fs.writeJSON(paths.dataPath, projectData, { spaces: 2 });

          res.json({
            success: true,
            document
          });
        } else {
          res.status(500).json({ error: 'AI analysis failed' });
        }
      } else {
        res.status(404).json({ error: 'Document not found' });
      }
    } else {
      res.status(404).json({ error: 'Document not found' });
    }
  } catch (error) {
    console.error('AI analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add character to document
app.post('/api/documents/:id/characters', async (req, res) => {
  try {
    const { character } = req.body;
    if (!character) {
      return res.status(400).json({ error: 'Character name required' });
    }

    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      const document = projectData.documents.find(d => d.id === req.params.id);

      if (document) {
        if (!document.characters) document.characters = [];

        // Check if character already exists
        if (!document.characters.includes(character)) {
          document.characters.push(character);
          await fs.writeJSON(paths.dataPath, projectData, { spaces: 2 });
          res.json({ success: true, characters: document.characters });
        } else {
          res.status(400).json({ error: 'Character already exists' });
        }
      } else {
        res.status(404).json({ error: 'Document not found' });
      }
    } else {
      res.status(404).json({ error: 'Project not found' });
    }
  } catch (error) {
    console.error('Add character error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove character from document
app.delete('/api/documents/:id/characters', async (req, res) => {
  try {
    const { character } = req.body;
    if (!character) {
      return res.status(400).json({ error: 'Character name required' });
    }

    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      const document = projectData.documents.find(d => d.id === req.params.id);

      if (document) {
        if (document.characters) {
          document.characters = document.characters.filter(c => c !== character);
          await fs.writeJSON(paths.dataPath, projectData, { spaces: 2 });
          res.json({ success: true, characters: document.characters });
        } else {
          res.status(400).json({ error: 'No characters found' });
        }
      } else {
        res.status(404).json({ error: 'Document not found' });
      }
    } else {
      res.status(404).json({ error: 'Project not found' });
    }
  } catch (error) {
    console.error('Remove character error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add theme to document
app.post('/api/documents/:id/themes', async (req, res) => {
  try {
    const { theme } = req.body;
    if (!theme) {
      return res.status(400).json({ error: 'Theme required' });
    }

    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      const document = projectData.documents.find(d => d.id === req.params.id);

      if (document) {
        if (!document.themes) document.themes = [];

        // Check if theme already exists
        if (!document.themes.includes(theme)) {
          document.themes.push(theme);
          await fs.writeJSON(paths.dataPath, projectData, { spaces: 2 });
          res.json({ success: true, themes: document.themes });
        } else {
          res.status(400).json({ error: 'Theme already exists' });
        }
      } else {
        res.status(404).json({ error: 'Document not found' });
      }
    } else {
      res.status(404).json({ error: 'Project not found' });
    }
  } catch (error) {
    console.error('Add theme error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove theme from document
app.delete('/api/documents/:id/themes', async (req, res) => {
  try {
    const { theme } = req.body;
    if (!theme) {
      return res.status(400).json({ error: 'Theme required' });
    }

    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      const document = projectData.documents.find(d => d.id === req.params.id);

      if (document) {
        if (document.themes) {
          document.themes = document.themes.filter(t => t !== theme);
          await fs.writeJSON(paths.dataPath, projectData, { spaces: 2 });
          res.json({ success: true, themes: document.themes });
        } else {
          res.status(400).json({ error: 'No themes found' });
        }
      } else {
        res.status(404).json({ error: 'Document not found' });
      }
    } else {
      res.status(404).json({ error: 'Project not found' });
    }
  } catch (error) {
    console.error('Remove theme error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get full document text
app.get('/api/documents/:id/text', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      const document = projectData.documents.find(d => d.id === req.params.id);

      if (document) {
        const uploadPath = path.join(paths.uploadsDir, document.filePath);
        const text = await extractTextFromFile(uploadPath, document.filename);
        res.json({ success: true, text });
      } else {
        res.status(404).json({ error: 'Document not found' });
      }
    } else {
      res.status(404).json({ error: 'Project not found' });
    }
  } catch (error) {
    console.error('Get document text error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update grid (mark document for Story Grid inclusion with AI analysis)
app.post('/api/documents/:id/update-grid', async (req, res) => {
  try {
    if (!openai) {
      return res.status(400).json({ error: 'AI analysis not available. Set OPENROUTER_API_KEY in .env' });
    }

    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      const document = projectData.documents.find(d => d.id === req.params.id);

      if (document) {
        // Load full document text
        const uploadPath = path.join(paths.uploadsDir, document.filePath);
        const text = await extractTextFromFile(uploadPath, document.filename);

        // Get the user's preferred model or default
        const model = req.body?.model || 'openai/gpt-4o';

        // Use existing characters from document (including manual edits)
        const characters = document.characters || [];
        const themes = document.themes || [];

        if (characters.length === 0) {
          return res.status(400).json({
            error: 'No characters found in document. Please analyze the document first or add characters manually.'
          });
        }

        // AI prompt to analyze story structure
        const prompt = `You are analyzing a screenplay/story document to create a Story Grid.

Document Type: ${document.type}
Characters: ${characters.join(', ')}
Themes: ${themes.join(', ')}

Please analyze this document and identify:

1. The episode/chapter/act structure (how many distinct episodes or story beats are there?)
2. For each episode/chapter/act, what does EACH character do? (Be specific but concise - 1-2 sentences per character per episode)
3. Which themes appear in each episode/character combination?

IMPORTANT FORMATTING - Respond with ONLY valid JSON in this exact format:
{
  "episodes": [
    { "number": 1, "title": "Episode Title or Act Name" },
    { "number": 2, "title": "Next Episode Title" }
  ],
  "characterActions": {
    "CHARACTER_NAME": {
      "1": "What this character does in episode 1",
      "2": "What this character does in episode 2"
    }
  },
  "themeAppearances": {
    "CHARACTER_NAME": {
      "1": ["theme1", "theme2"],
      "2": ["theme1"]
    }
  }
}

Document text:
${text.slice(0, 15000)}`;

        console.log('Generating story grid with AI...');

        const completion = await openai.chat.completions.create({
          model: model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 4000
        });

        const responseText = completion.choices[0].message.content.trim();

        // Extract JSON from response (handle markdown code blocks)
        let jsonText = responseText;
        if (responseText.includes('```json')) {
          jsonText = responseText.split('```json')[1].split('```')[0].trim();
        } else if (responseText.includes('```')) {
          jsonText = responseText.split('```')[1].split('```')[0].trim();
        }

        const gridData = JSON.parse(jsonText);

        // Save to document
        document.episodes = gridData.episodes;
        document.characterActions = gridData.characterActions;
        document.themeAppearances = gridData.themeAppearances || {};
        document.inStoryGrid = true;
        document.gridUpdatedAt = new Date().toISOString();

        await fs.writeJSON(paths.dataPath, projectData, { spaces: 2 });

        res.json({
          success: true,
          message: 'Story grid generated with AI',
          episodes: gridData.episodes,
          characterActions: gridData.characterActions,
          themeAppearances: gridData.themeAppearances
        });
      } else {
        res.status(404).json({ error: 'Document not found' });
      }
    } else {
      res.status(404).json({ error: 'Project not found' });
    }
  } catch (error) {
    console.error('Update grid error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save story grid data for a specific document
app.post('/api/story-grid/:id', async (req, res) => {
  try {
    const { episodes, characterActions, sectionActions, themeAppearances, characterOrder } = req.body;

    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      const document = projectData.documents.find(d => d.id === req.params.id);

      if (document) {
        // Save episodes, character actions, section actions, theme appearances, and character order to document
        if (episodes) document.episodes = episodes;
        if (characterActions) document.characterActions = characterActions;
        if (sectionActions) document.sectionActions = sectionActions;
        if (themeAppearances) document.themeAppearances = themeAppearances;
        if (characterOrder) document.characterOrder = characterOrder;
        document.gridUpdatedAt = new Date().toISOString();

        await fs.writeJSON(paths.dataPath, projectData, { spaces: 2 });
        res.json({ success: true, message: 'Story grid saved' });
      } else {
        res.status(404).json({ error: 'Document not found' });
      }
    } else {
      res.status(404).json({ error: 'Project not found' });
    }
  } catch (error) {
    console.error('Save story grid error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Compare two documents
app.get('/api/compare/:id1/:id2', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      let doc1 = projectData.documents.find(d => d.id === req.params.id1);
      let doc2 = projectData.documents.find(d => d.id === req.params.id2);

      if (!doc1 || !doc2) {
        return res.status(404).json({ error: 'One or both documents not found' });
      }

      // Ensure doc1 is older, doc2 is newer (by date)
      if (new Date(doc1.date) > new Date(doc2.date)) {
        [doc1, doc2] = [doc2, doc1]; // Swap
      }

      // Load original text from both documents
      const text1Path = path.join(paths.uploadsDir, doc1.filePath);
      const text2Path = path.join(paths.uploadsDir, doc2.filePath);

      const text1 = await extractTextFromFile(text1Path, doc1.filename);
      const text2 = await extractTextFromFile(text2Path, doc2.filename);

      // Generate diff
      const textDiff = Diff.diffWords(text1, text2);

      // Calculate statistics
      let added = 0, removed = 0, unchanged = 0;
      textDiff.forEach(part => {
        const wordCount = part.value.split(/\s+/).filter(w => w.length > 0).length;
        if (part.added) added += wordCount;
        else if (part.removed) removed += wordCount;
        else unchanged += wordCount;
      });

      // Character changes
      const newCharacters = doc2.characters.filter(c => !doc1.characters.includes(c));
      const removedCharacters = doc1.characters.filter(c => !doc2.characters.includes(c));

      // Theme changes
      const newThemes = doc2.themes.filter(t => !doc1.themes.includes(t));
      const removedThemes = doc1.themes.filter(t => !doc2.themes.includes(t));
      const unchangedThemes = doc1.themes.filter(t => doc2.themes.includes(t));

      // Thematic shift analysis
      const themeCountChange = doc2.themes.length - doc1.themes.length;
      const thematicShift = {
        added: newThemes.length,
        removed: removedThemes.length,
        unchanged: unchangedThemes.length,
        totalChange: newThemes.length + removedThemes.length,
        netChange: themeCountChange,
        shiftPercentage: doc1.themes.length > 0
          ? Math.round(((newThemes.length + removedThemes.length) / doc1.themes.length) * 100)
          : 0
      };

      // Section changes (comparing section titles)
      const doc1SectionTitles = doc1.sections.map(s => s.title);
      const doc2SectionTitles = doc2.sections.map(s => s.title);
      const newSections = doc2.sections.filter(s => !doc1SectionTitles.includes(s.title));
      const removedSections = doc1.sections.filter(s => !doc2SectionTitles.includes(s.title));

      // Generate AI brief if OpenRouter is configured
      const statsForBrief = {
        wordsAdded: added,
        wordsRemoved: removed,
        wordCountChange: doc2.wordCount - doc1.wordCount,
        newCharacters,
        removedCharacters,
        newThemes,
        removedThemes,
        newSections,
        removedSections
      };

      const brief = await generateComparisonBrief(
        doc1,
        doc2,
        statsForBrief,
        text1.substring(0, 500),
        text2.substring(0, 500)
      );

      res.json({
        doc1: {
          id: doc1.id,
          filename: doc1.filename,
          date: doc1.date,
          wordCount: doc1.wordCount,
          characters: doc1.characters,
          themes: doc1.themes,
          sections: doc1.sections
        },
        doc2: {
          id: doc2.id,
          filename: doc2.filename,
          date: doc2.date,
          wordCount: doc2.wordCount,
          characters: doc2.characters,
          themes: doc2.themes,
          sections: doc2.sections
        },
        stats: {
          wordsAdded: added,
          wordsRemoved: removed,
          wordsUnchanged: unchanged,
          wordCountChange: doc2.wordCount - doc1.wordCount,
          newCharacters,
          removedCharacters,
          newThemes,
          removedThemes,
          unchangedThemes,
          thematicShift,
          newSections,
          removedSections,
          sectionCountChange: doc2.sections.length - doc1.sections.length
        },
        brief: brief || null
      });
    } else {
      res.status(404).json({ error: 'Project data not found' });
    }
  } catch (error) {
    console.error('Compare error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get timeline/stats
app.get('/api/timeline', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      const documents = projectData.documents;

      const stats = {
        totalDocuments: documents.length,
        totalWords: documents.reduce((sum, d) => sum + d.wordCount, 0),
        documentTypes: {},
        firstDate: documents.length > 0 ? documents[0].date : null,
        lastDate: documents.length > 0 ? documents[documents.length - 1].date : null,
        allCharacters: [...new Set(documents.flatMap(d => d.characters))].sort(),
        allThemes: [...new Set(documents.flatMap(d => d.themes))].sort()
      };

      // Count document types
      documents.forEach(d => {
        stats.documentTypes[d.type] = (stats.documentTypes[d.type] || 0) + 1;
      });

      // Reverse chronological order (newest first)
      const documentsReversed = [...documents].reverse();

      // Add styling information to each document
      const documentsWithStyle = documentsReversed.map(doc => ({
        ...doc,
        style: getDocumentTypeStyle(doc.type)
      }));

      res.json({
        documents: documentsWithStyle,
        stats
      });
    } else {
      res.json({
        documents: [],
        stats: {
          totalDocuments: 0,
          totalWords: 0,
          documentTypes: {},
          firstDate: null,
          lastDate: null,
          allCharacters: [],
          allThemes: []
        }
      });
    }
  } catch (error) {
    console.error('Timeline error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Story Grid - tracks characters/themes across all documents
app.get('/api/story-grid', async (req, res) => {
  try {
    const projectId = getProjectId(req);
    const paths = getProjectPaths(projectId);

    if (await fs.pathExists(paths.dataPath)) {
      const projectData = await fs.readJSON(paths.dataPath);
      const documents = projectData.documents;

      // Sort documents chronologically
      const sortedDocs = [...documents].sort((a, b) => new Date(a.date) - new Date(b.date));

      // Get all unique characters and themes (with safety checks)
      const allCharacters = [...new Set(documents.flatMap(d => d.characters || []))].sort();
      const allThemes = [...new Set(documents.flatMap(d => d.themes || []))].sort();

      // Build character matrix (character × document)
      const characterGrid = allCharacters.map(character => {
        const appearances = sortedDocs.map(doc => ({
          docId: doc.id,
          docName: doc.filename,
          docDate: doc.date,
          present: (doc.characters || []).includes(character),
          // Count occurrences in full text if needed (future enhancement)
          mentions: (doc.characters || []).includes(character) ? 1 : 0
        }));

        return {
          character,
          appearances,
          totalAppearances: appearances.filter(a => a.present).length,
          firstAppearance: appearances.find(a => a.present)?.docDate || null,
          lastAppearance: [...appearances].reverse().find(a => a.present)?.docDate || null
        };
      });

      // Build theme matrix (theme × document)
      const themeGrid = allThemes.map(theme => {
        const appearances = sortedDocs.map(doc => ({
          docId: doc.id,
          docName: doc.filename,
          docDate: doc.date,
          present: (doc.themes || []).includes(theme)
        }));

        return {
          theme,
          appearances,
          totalAppearances: appearances.filter(a => a.present).length,
          firstAppearance: appearances.find(a => a.present)?.docDate || null,
          lastAppearance: [...appearances].reverse().find(a => a.present)?.docDate || null
        };
      });

      res.json({
        documents: sortedDocs.map(d => ({
          id: d.id,
          filename: d.filename,
          date: d.date,
          type: d.type,
          wordCount: d.wordCount,
          characters: d.characters || [],
          themes: d.themes || [],
          sections: d.sections || [],
          sectionActions: d.sectionActions || {},
          episodes: d.episodes || [],
          characterActions: d.characterActions || {},
          themeAppearances: d.themeAppearances || {},
          characterOrder: d.characterOrder || []
        })),
        characterGrid,
        themeGrid,
        stats: {
          totalDocuments: documents.length,
          totalCharacters: allCharacters.length,
          totalThemes: allThemes.length,
          dateRange: {
            first: sortedDocs[0]?.date || null,
            last: sortedDocs[sortedDocs.length - 1]?.date || null
          }
        }
      });
    } else {
      res.json({
        documents: [],
        characterGrid: [],
        themeGrid: [],
        stats: {
          totalDocuments: 0,
          totalCharacters: 0,
          totalThemes: 0,
          dateRange: { first: null, last: null }
        }
      });
    }
  } catch (error) {
    console.error('Story grid error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get document type information
app.get('/api/document-types', (req, res) => {
  // Return document types with descriptions and styling
  const types = {};
  Object.keys(DOCUMENT_TYPES).forEach(key => {
    const type = DOCUMENT_TYPES[key];
    types[key] = {
      name: type.name,
      description: type.description,
      expectedContent: type.expectedContent,
      style: getDocumentTypeStyle(key),
      isExternal: type.isExternal || false,
      isInternal: type.isInternal || false
    };
  });
  res.json(types);
});

// ========================================
// PROJECT MANAGEMENT ENDPOINTS
// ========================================

// Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    const projectDirs = await fs.readdir(PROJECTS_DIR);
    const projects = [];

    for (const dirName of projectDirs) {
      const projectPath = path.join(PROJECTS_DIR, dirName);
      const stat = await fs.stat(projectPath);

      if (stat.isDirectory()) {
        const metaPath = path.join(projectPath, 'project-meta.json');
        const dataPath = path.join(projectPath, 'project-data.json');

        // Read project metadata
        let meta = {
          id: dirName,
          name: dirName,
          createdAt: stat.birthtime
        };

        if (await fs.pathExists(metaPath)) {
          const savedMeta = await fs.readJSON(metaPath);
          meta = { ...meta, ...savedMeta };
        }

        // Get document stats
        let documentCount = 0;
        let characterCount = 0;
        let themeCount = 0;

        if (await fs.pathExists(dataPath)) {
          const projectData = await fs.readJSON(dataPath);
          documentCount = projectData.documents?.length || 0;

          const allCharacters = [...new Set(projectData.documents?.flatMap(d => d.characters || []) || [])];
          const allThemes = [...new Set(projectData.documents?.flatMap(d => d.themes || []) || [])];

          characterCount = allCharacters.length;
          themeCount = allThemes.length;
        }

        projects.push({
          ...meta,
          documentCount,
          characterCount,
          themeCount
        });
      }
    }

    // Sort by most recently updated
    projects.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt);
      const dateB = new Date(b.updatedAt || b.createdAt);
      return dateB - dateA;
    });

    res.json({ success: true, projects });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new project
app.post('/api/projects', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Project name is required' });
    }

    // Generate project ID from name (sanitized)
    const projectId = name.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const projectPath = path.join(PROJECTS_DIR, projectId);

    // Check if project already exists
    if (await fs.pathExists(projectPath)) {
      return res.status(400).json({ success: false, error: 'A project with this name already exists' });
    }

    // Create project directory
    await fs.ensureDir(projectPath);
    await fs.ensureDir(path.join(projectPath, 'uploads'));

    // Create project metadata
    const metadata = {
      id: projectId,
      name: name.trim(),
      description: description?.trim() || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await fs.writeJSON(path.join(projectPath, 'project-meta.json'), metadata, { spaces: 2 });

    // Create empty project data file
    const projectData = {
      documents: []
    };

    await fs.writeJSON(path.join(projectPath, 'project-data.json'), projectData, { spaces: 2 });

    res.json({
      success: true,
      project: {
        ...metadata,
        documentCount: 0,
        characterCount: 0,
        themeCount: 0
      }
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const projectPath = path.join(PROJECTS_DIR, req.params.id);

    if (!(await fs.pathExists(projectPath))) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Delete entire project directory
    await fs.remove(projectPath);

    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get project settings
app.get('/api/projects/:id/settings', async (req, res) => {
  try {
    const paths = getProjectPaths(req.params.id);
    const settingsPath = path.join(paths.projectDir, 'project-settings.json');

    // If settings file exists, load it
    if (await fs.pathExists(settingsPath)) {
      const settings = await fs.readJSON(settingsPath);
      return res.json({ success: true, settings });
    }

    // Otherwise, return default settings
    res.json({
      success: true,
      settings: {
        aiPrompts: DEFAULT_AI_PROMPTS
      }
    });
  } catch (error) {
    console.error('Get project settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save project settings
app.post('/api/projects/:id/settings', async (req, res) => {
  try {
    const paths = getProjectPaths(req.params.id);
    const settingsPath = path.join(paths.projectDir, 'project-settings.json');

    // Validate that project exists
    if (!(await fs.pathExists(paths.projectDir))) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    // Save settings
    const settings = {
      aiPrompts: req.body.aiPrompts || {}
    };

    await fs.writeJSON(settingsPath, settings, { spaces: 2 });

    res.json({ success: true, message: 'Settings saved', settings });
  } catch (error) {
    console.error('Save project settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Larga server running on http://localhost:${PORT}`);
  console.log(`📁 Uploads directory: ${UPLOADS_DIR}`);
  console.log(`💾 Projects directory: ${PROJECTS_DIR}`);
  console.log(`🤖 AI Analysis: ${openai ? '✅ ENABLED (OpenRouter + GPT-4o)' : '❌ Disabled (set OPENROUTER_API_KEY in .env)'}`);
});
