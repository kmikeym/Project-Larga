/**
 * Document Type Taxonomy for Larga
 *
 * Defines all expected document types in a screenwriting workflow,
 * their characteristics, and what content to expect in each.
 */

const DOCUMENT_TYPES = {
  // ========================================
  // UNCLASSIFIED (Needs AI analysis)
  // ========================================

  unclassified: {
    name: 'Unclassified',
    description: 'Document pending AI analysis for classification',
    color: '#fffbeb', // Light yellow/amber background
    textColor: '#78350f', // Dark amber text
    expectedContent: [],
    filenameKeywords: [],
    contentKeywords: [],
    typicalWordCount: { min: 0, max: 999999 },
    priority: 0,
    needsAnalysis: true
  },

  // ========================================
  // PITCH MATERIALS (Selling the concept)
  // ========================================

  pitch: {
    name: 'Pitch',
    description: 'Full pitch document selling the series concept',
    color: '#fafafa', // Default background
    expectedContent: [
      'Logline',
      'Tone/Genre',
      'Comparable shows/films',
      'Character descriptions',
      'World/setting description',
      'Series arc overview',
      'Episode ideas or season breakdown',
      'Why now/cultural relevance'
    ],
    filenameKeywords: ['pitch', 'treatment'],
    contentKeywords: ['logline', 'tone', 'comparable', 'similar to', 'genre'],
    typicalWordCount: { min: 1500, max: 8000 },
    priority: 1 // High priority for classification
  },

  shortPitch: {
    name: 'Short Pitch',
    description: 'Condensed pitch (1-3 pages) for quick reads',
    color: '#fafafa',
    expectedContent: [
      'Logline',
      'Brief tone/genre',
      'Key characters (abbreviated)',
      'Core concept',
      'One-sentence series arc'
    ],
    filenameKeywords: ['short pitch', 'one sheet', 'leave behind'],
    contentKeywords: ['logline', 'in brief'],
    typicalWordCount: { min: 300, max: 1500 },
    priority: 2
  },

  // ========================================
  // STRUCTURAL DOCUMENTS (Planning)
  // ========================================

  beatSheet: {
    name: 'Beat Sheet',
    description: 'Scene-by-scene breakdown of episode or series',
    color: '#fafafa',
    expectedContent: [
      'Act breaks',
      'Scene numbers',
      'Brief scene descriptions',
      'Character beats',
      'Plot progression',
      'Page counts per scene'
    ],
    filenameKeywords: ['beat sheet', 'beats'],
    contentKeywords: ['act', 'scene', 'beat', 'teaser', 'cold open', 'tag'],
    typicalWordCount: { min: 1000, max: 5000 },
    priority: 2
  },

  outline: {
    name: 'Outline',
    description: 'Detailed story outline (more prose than beat sheet)',
    color: '#fafafa',
    expectedContent: [
      'Act structure',
      'Scene descriptions in paragraph form',
      'Character motivations',
      'Dialogue snippets',
      'Emotional beats'
    ],
    filenameKeywords: ['outline'],
    contentKeywords: ['act one', 'act two', 'act three', 'opens with', 'we see'],
    typicalWordCount: { min: 2000, max: 10000 },
    priority: 2
  },

  // ========================================
  // DRAFT MATERIALS (Actual scripts)
  // ========================================

  pilot: {
    name: 'Pilot Script',
    description: 'First episode screenplay',
    color: '#fafafa',
    expectedContent: [
      'Screenplay formatting',
      'Scene headings (INT./EXT.)',
      'Action lines',
      'Character dialogue',
      'Transitions'
    ],
    filenameKeywords: ['pilot', 'episode 1', 'ep1', 'ep 1'],
    contentKeywords: ['int.', 'ext.', 'fade in', 'fade out'],
    typicalWordCount: { min: 8000, max: 15000 },
    priority: 3
  },

  draft: {
    name: 'Draft',
    description: 'Script draft (any version/revision)',
    color: '#fafafa',
    expectedContent: [
      'Screenplay formatting',
      'Scene headings',
      'Dialogue',
      'Action'
    ],
    filenameKeywords: ['draft', 'revision', 'version', 'v1', 'v2', 'v3'],
    contentKeywords: ['int.', 'ext.', 'fade'],
    typicalWordCount: { min: 8000, max: 15000 },
    priority: 3
  },

  trimmedDraft: {
    name: 'Trimmed Draft',
    description: 'Shortened version of script (for timing/budget)',
    color: '#fafafa',
    expectedContent: [
      'Screenplay formatting',
      'Reduced scene count',
      'Condensed dialogue'
    ],
    filenameKeywords: ['trimmed', 'cut', 'shortened'],
    contentKeywords: ['int.', 'ext.'],
    typicalWordCount: { min: 6000, max: 12000 },
    priority: 3
  },

  // ========================================
  // SERIES PLANNING
  // ========================================

  seriesDoc: {
    name: 'Series Document',
    description: 'Multi-episode arc planning (season or series)',
    color: '#fafafa',
    expectedContent: [
      'Episode summaries',
      'Character arcs across episodes',
      'Seasonal themes',
      'Story engine',
      'Episode titles'
    ],
    filenameKeywords: ['series', 'season', 'episodes', 'multi-episode'],
    contentKeywords: ['episode', 'season', 'arc', 'story engine'],
    typicalWordCount: { min: 3000, max: 12000 },
    priority: 2
  },

  // ========================================
  // SUPPLEMENTARY MATERIALS
  // ========================================

  characterBreakdown: {
    name: 'Character Breakdown',
    description: 'Detailed character analysis/descriptions',
    color: '#fafafa',
    expectedContent: [
      'Character names',
      'Physical descriptions',
      'Backstories',
      'Motivations',
      'Relationships',
      'Character arcs'
    ],
    filenameKeywords: ['character', 'cast', 'breakdown', 'bios'],
    contentKeywords: ['protagonist', 'antagonist', 'backstory', 'motivation'],
    typicalWordCount: { min: 1000, max: 5000 },
    priority: 2
  },

  worldBuilding: {
    name: 'World Building',
    description: 'Setting, rules, mythology documents',
    color: '#fafafa',
    expectedContent: [
      'Setting descriptions',
      'World rules',
      'History/mythology',
      'Cultural details',
      'Visual references'
    ],
    filenameKeywords: ['world', 'setting', 'universe', 'mythology', 'bible'],
    contentKeywords: ['setting', 'world', 'universe', 'rules'],
    typicalWordCount: { min: 1000, max: 8000 },
    priority: 2
  },

  extraMaterials: {
    name: 'Extra Materials',
    description: 'Supporting materials (visual references, research, etc.)',
    color: '#fafafa',
    expectedContent: [
      'Visual references',
      'Research notes',
      'Mood boards',
      'Supplementary info'
    ],
    filenameKeywords: ['extra', 'materials', 'supplemental', '附加', 'additional'],
    contentKeywords: [],
    typicalWordCount: { min: 500, max: 5000 },
    priority: 1
  },

  // ========================================
  // NOTES & FEEDBACK (External input)
  // ========================================

  notes: {
    name: 'Notes',
    description: 'External feedback from producers, agents, executives',
    color: '#fff5f5', // Light red background to distinguish external input
    textColor: '#991b1b', // Dark red text
    expectedContent: [
      'Feedback points',
      'Questions',
      'Suggestions',
      'Concerns',
      'Praise',
      'Action items',
      'Attribution (who gave the notes)'
    ],
    filenameKeywords: ['notes', 'feedback', 'comments', 'response', 'from'],
    contentKeywords: ['feedback', 'notes', 'concern', 'question', 'suggestion', 'love', 'confused'],
    typicalWordCount: { min: 100, max: 3000 },
    priority: 1, // High priority - important to distinguish
    isExternal: true // Flag for special UI treatment
  },

  // ========================================
  // SESSION NOTES (Internal brainstorming)
  // ========================================

  sessionNotes: {
    name: 'Session Notes',
    description: 'Quick brainstorming/thinking session notes',
    color: '#fafafa',
    expectedContent: [
      'Stream of consciousness',
      'Ideas',
      'Questions to self',
      'Quick thoughts',
      'Action items'
    ],
    filenameKeywords: ['sesh', 'session', 'thinking', 'thoughts', 'ideas'],
    contentKeywords: ['idea', 'what if', 'maybe', 'thought'],
    typicalWordCount: { min: 50, max: 2000 },
    priority: 2,
    isInternal: true
  },

  quickNote: {
    name: 'Quick Note',
    description: 'Very brief note (often just date in filename)',
    color: '#fafafa',
    expectedContent: [
      'Brief thoughts',
      'Reminders',
      'Quick updates'
    ],
    filenameKeywords: [], // Usually just date
    contentKeywords: [],
    typicalWordCount: { min: 10, max: 500 },
    priority: 0, // Lowest - catch-all for small RTF files
    isInternal: true
  },

  // ========================================
  // WORKING VERSIONS (Process documents)
  // ========================================

  goldilocks: {
    name: 'Goldilocks Version',
    description: 'Just-right condensed version (not too long, not too short)',
    color: '#fafafa',
    expectedContent: [
      'Balanced pitch',
      'Key details without bloat',
      'Ready for specific audience'
    ],
    filenameKeywords: ['goldilocks', 'just right'],
    contentKeywords: [],
    typicalWordCount: { min: 1000, max: 4000 },
    priority: 2
  },

  toAggregate: {
    name: 'To Aggregate',
    description: 'Version prepared for aggregation/sharing with team',
    color: '#fafafa',
    expectedContent: [
      'Polished content',
      'Ready for distribution',
      'Consolidated changes'
    ],
    filenameKeywords: ['to aggregate', 'toaggregate', 'for aggregate'],
    contentKeywords: [],
    typicalWordCount: { min: 1000, max: 10000 },
    priority: 1
  },

  forToday: {
    name: 'For Today',
    description: 'Version prepared for specific meeting/deadline',
    color: '#fafafa',
    expectedContent: [
      'Meeting-ready content',
      'Targeted for specific audience/date'
    ],
    filenameKeywords: ['for today', 'for tomorrow', 'for meeting'],
    contentKeywords: [],
    typicalWordCount: { min: 500, max: 8000 },
    priority: 1
  },

  // ========================================
  // LEGAL/BUSINESS
  // ========================================

  legal: {
    name: 'Legal Document',
    description: 'Contracts, agreements, legal paperwork',
    color: '#f5f5f5', // Slightly gray background
    expectedContent: [
      'Legal language',
      'Terms and conditions',
      'Signatures',
      'Contract clauses'
    ],
    filenameKeywords: ['agreement', 'contract', 'shopping', 'attachment', 'option', 'docusign'],
    contentKeywords: ['agreement', 'contract', 'party', 'terms', 'whereas'],
    typicalWordCount: { min: 1000, max: 20000 },
    priority: 1,
    isExternal: true
  }
};

/**
 * Classification priority order (highest to lowest)
 * Documents are checked in this order, first match wins
 */
const CLASSIFICATION_ORDER = [
  'legal',           // Check first (very distinct keywords)
  'notes',           // Check early (important to catch external feedback)
  'extraMaterials',  // Check early (very specific keyword)
  'toAggregate',     // Process documents (specific keywords)
  'forToday',
  'goldilocks',
  'shortPitch',      // Specific pitch types
  'beatSheet',       // Structural docs
  'outline',
  'seriesDoc',
  'characterBreakdown',
  'worldBuilding',
  'trimmedDraft',    // Draft variations
  'pilot',
  'draft',
  'pitch',           // General pitch (check after specific types)
  'sessionNotes',    // Internal notes
  'quickNote'        // Catch-all for small files
];

/**
 * Classify a document based on filename and content
 */
function classifyDocument(filename, text) {
  const lowerFilename = filename.toLowerCase();
  const lowerText = text.toLowerCase();
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

  // Check each type in priority order
  for (const typeKey of CLASSIFICATION_ORDER) {
    const type = DOCUMENT_TYPES[typeKey];

    // Check filename keywords
    if (type.filenameKeywords.length > 0) {
      const filenameMatch = type.filenameKeywords.some(keyword =>
        lowerFilename.includes(keyword.toLowerCase())
      );
      if (filenameMatch) {
        return typeKey;
      }
    }

    // Check content keywords (if provided)
    if (type.contentKeywords.length > 0) {
      const contentMatch = type.contentKeywords.some(keyword =>
        lowerText.includes(keyword.toLowerCase())
      );
      if (contentMatch) {
        // Verify word count is reasonable for this type
        if (wordCount >= (type.typicalWordCount?.min || 0)) {
          return typeKey;
        }
      }
    }

    // Special case for quickNote: very small RTF files with just date in name
    if (typeKey === 'quickNote' && wordCount < 500 && filename.endsWith('.rtf')) {
      // If filename is mostly just a date pattern, it's a quick note
      const datePattern = /\d{6,8}/;
      const hasDateOnly = datePattern.test(filename) && filename.replace(/[\d._\s-]/g, '').length < 10;
      if (hasDateOnly) {
        return 'quickNote';
      }
    }
  }

  // Default fallback
  if (wordCount < 500) return 'quickNote';
  if (wordCount < 2000) return 'sessionNotes';
  return 'pitch'; // Default to pitch for substantial documents
}

/**
 * Get UI styling for a document type
 */
function getDocumentTypeStyle(typeKey) {
  const type = DOCUMENT_TYPES[typeKey];
  if (!type) return { backgroundColor: '#fafafa', color: '#111', border: '1px solid #e0e0e0' };

  // Special border for unclassified documents
  let borderStyle = '1px solid #e0e0e0';
  if (typeKey === 'unclassified') {
    borderStyle = '2px solid #fbbf24'; // Yellow border for unclassified
  } else if (type.isExternal) {
    borderStyle = '1px solid #fca5a5'; // Pink border for external notes
  }

  return {
    backgroundColor: type.color,
    color: type.textColor || '#111',
    border: borderStyle
  };
}

module.exports = {
  DOCUMENT_TYPES,
  CLASSIFICATION_ORDER,
  classifyDocument,
  getDocumentTypeStyle
};
