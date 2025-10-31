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
const { parseStream } = require('rtf-parser');

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

// Ensure required directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PROJECTS_DIR = path.join(__dirname, 'projects');
fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(PROJECTS_DIR);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
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

          parseStream(stream, (err, doc) => {
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

// Helper function to classify document type
function classifyDocumentType(filename, text) {
  const lowerFilename = filename.toLowerCase();
  const lowerText = text.toLowerCase();

  // Check filename first
  if (lowerFilename.includes('notes') || lowerFilename.includes('feedback') || lowerFilename.includes('comments')) {
    return 'notes';
  }
  if (lowerFilename.includes('pitch') || lowerFilename.includes('treatment')) {
    return 'pitch';
  }
  if (lowerFilename.includes('outline')) {
    return 'outline';
  }
  if (lowerFilename.includes('draft') || lowerFilename.includes('revision')) {
    return 'draft';
  }

  // Analyze content for better classification
  const firstParagraph = text.substring(0, 1000).toLowerCase();

  // Notes indicators - look for feedback language
  const notesIndicators = [
    'notes from',
    'feedback on',
    'comments on',
    'thoughts on',
    'suggestions:',
    'changes needed',
    'needs work',
    'consider changing',
    'please revise',
    'i think you should',
    'my notes:',
    'overall thoughts'
  ];
  const notesScore = notesIndicators.filter(indicator => lowerText.includes(indicator)).length;

  // Pitch indicators - selling/marketing language
  const pitchIndicators = [
    'logline:',
    'logline',
    'one-liner:',
    'elevator pitch',
    'series bible',
    'genre:',
    'tone:',
    'comparable titles',
    'similar to',
    'meets',
    'in the vein of',
    'target audience',
    'why now',
    'market opportunity'
  ];
  const pitchScore = pitchIndicators.filter(indicator => firstParagraph.includes(indicator)).length;

  // Draft/Script indicators - screenplay formatting
  const scriptIndicators = [
    'fade in',
    'int.',
    'ext.',
    'fade out',
    'cut to:',
    'scene heading',
    'action:',
    'dialogue:'
  ];
  const scriptScore = scriptIndicators.filter(indicator => lowerText.includes(indicator)).length;

  // Classify based on scores
  if (notesScore >= 2) return 'notes';
  if (pitchScore >= 2) return 'pitch';
  if (scriptScore >= 2) return 'draft';

  // Fallback to generic types
  if (lowerText.includes('logline') || lowerText.includes('tone:')) return 'pitch';
  if (lowerText.includes('notes from')) return 'notes';

  return 'document';
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

// AI-powered content analysis (optional, uses OpenRouter if configured)
async function analyzeContentWithAI(text, filename) {
  if (!openai) {
    return null; // Fall back to regex-based extraction
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "openai/gpt-4o",  // Using OpenAI to avoid Bedrock moderation issues
      messages: [{
        role: "user",
        content: `Analyze this screenplay/story document and extract key information.

Document filename: ${filename}

Text excerpt (first 4000 chars):
${text.substring(0, 4000)}

Please provide a JSON response with:
1. "characters": Array of character names (actual people, not concepts)
2. "themes": Array of major themes (3-5 themes)
3. "summary": One sentence summary of the document
4. "genre": The genre (e.g., "drama", "comedy", "thriller")

Return only valid JSON, no additional text.`
      }],
      response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    analysis.model = "openai/gpt-4o"; // Track which model was used
    return analysis;
  } catch (error) {
    console.error('AI analysis error:', error.message);
    return null; // Fall back to regex-based extraction
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
    const type = classifyDocumentType(originalFilename, text);
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

    // Analyze content with regex (AI analysis available on-demand)
    const sections = extractSections(text);
    const characters = extractCharacters(text);
    const themes = extractThemes(text);

    // Create document object
    const document = {
      id: Date.now().toString(),
      filename: originalFilename,
      uploadedAt: new Date().toISOString(),
      date: date.toISOString(),
      type,
      wordCount,
      sections,
      characters,
      themes,
      filePath: req.file.filename,
      aiEnhanced: false,
      summary: null,
      genre: null
    };

    // Load or create project data
    const projectDataPath = path.join(PROJECTS_DIR, 'project-data.json');
    let projectData = { documents: [] };

    if (await fs.pathExists(projectDataPath)) {
      projectData = await fs.readJSON(projectDataPath);
    }

    // Add document and sort by date
    projectData.documents.push(document);
    projectData.documents.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Save project data
    await fs.writeJSON(projectDataPath, projectData, { spaces: 2 });

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
    const projectDataPath = path.join(PROJECTS_DIR, 'project-data.json');

    if (await fs.pathExists(projectDataPath)) {
      const projectData = await fs.readJSON(projectDataPath);
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
    const projectDataPath = path.join(PROJECTS_DIR, 'project-data.json');

    if (await fs.pathExists(projectDataPath)) {
      const projectData = await fs.readJSON(projectDataPath);
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
    const projectDataPath = path.join(PROJECTS_DIR, 'project-data.json');

    if (await fs.pathExists(projectDataPath)) {
      const projectData = await fs.readJSON(projectDataPath);
      const documentIndex = projectData.documents.findIndex(d => d.id === req.params.id);

      if (documentIndex !== -1) {
        const document = projectData.documents[documentIndex];

        // Delete the uploaded file
        const uploadPath = path.join(UPLOADS_DIR, document.filePath);
        if (await fs.pathExists(uploadPath)) {
          await fs.remove(uploadPath);
        }

        // Remove from documents array
        projectData.documents.splice(documentIndex, 1);

        // Save updated data
        await fs.writeJSON(projectDataPath, projectData, { spaces: 2 });

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

    const projectDataPath = path.join(PROJECTS_DIR, 'project-data.json');

    if (await fs.pathExists(projectDataPath)) {
      const projectData = await fs.readJSON(projectDataPath);
      const document = projectData.documents.find(d => d.id === req.params.id);

      if (document) {
        // Load the original file to get full text
        const uploadPath = path.join(UPLOADS_DIR, document.filePath);
        const text = await extractTextFromFile(uploadPath, document.filename);

        // Run AI analysis
        const aiAnalysis = await analyzeContentWithAI(text, document.filename);

        if (aiAnalysis) {
          // Update document with AI analysis
          document.characters = aiAnalysis.characters;
          document.themes = aiAnalysis.themes;
          document.summary = aiAnalysis.summary;
          document.genre = aiAnalysis.genre;
          document.aiEnhanced = true;
          document.aiModel = aiAnalysis.model; // Track which AI model was used

          // Save updated data
          await fs.writeJSON(projectDataPath, projectData, { spaces: 2 });

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

// Compare two documents
app.get('/api/compare/:id1/:id2', async (req, res) => {
  try {
    const projectDataPath = path.join(PROJECTS_DIR, 'project-data.json');

    if (await fs.pathExists(projectDataPath)) {
      const projectData = await fs.readJSON(projectDataPath);
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
      const text1Path = path.join(UPLOADS_DIR, doc1.filePath);
      const text2Path = path.join(UPLOADS_DIR, doc2.filePath);

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
    const projectDataPath = path.join(PROJECTS_DIR, 'project-data.json');

    if (await fs.pathExists(projectDataPath)) {
      const projectData = await fs.readJSON(projectDataPath);
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

      res.json({
        documents: documentsReversed,
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
    const projectDataPath = path.join(PROJECTS_DIR, 'project-data.json');

    if (await fs.pathExists(projectDataPath)) {
      const projectData = await fs.readJSON(projectDataPath);
      const documents = projectData.documents;

      // Sort documents chronologically
      const sortedDocs = [...documents].sort((a, b) => new Date(a.date) - new Date(b.date));

      // Get all unique characters and themes
      const allCharacters = [...new Set(documents.flatMap(d => d.characters))].sort();
      const allThemes = [...new Set(documents.flatMap(d => d.themes))].sort();

      // Build character matrix (character × document)
      const characterGrid = allCharacters.map(character => {
        const appearances = sortedDocs.map(doc => ({
          docId: doc.id,
          docName: doc.filename,
          docDate: doc.date,
          present: doc.characters.includes(character),
          // Count occurrences in full text if needed (future enhancement)
          mentions: doc.characters.includes(character) ? 1 : 0
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
          present: doc.themes.includes(theme)
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
          wordCount: d.wordCount
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
