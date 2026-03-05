/**
 * ANSIR DOI Metadata Resolution Script
 *
 * Reads data/data.json, resolves DOI metadata (title, authors, journal, year)
 * for all relatedObjects via CrossRef and DataCite APIs, and writes the
 * enriched data back.
 *
 * Run by GitHub Actions after data.json is updated from the dashboard.
 *
 * Usage: node scripts/resolve-dois.js
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'data.json');
const CROSSREF_API = 'https://api.crossref.org/works/';
const DATACITE_API = 'https://api.datacite.org/dois/';
const USER_AGENT = 'ANSIR-GitHubAction/1.0 (mailto:ben@auscope.org.au)';

// Rate limiting: pause between API calls to be polite
const DELAY_MS = 300;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract a clean DOI from a URL or identifier string
 */
function extractDOI(identifier) {
  if (!identifier) return null;
  const match = String(identifier).trim().match(
    /(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)?(10\.\d{4,}\/[^\s]+)/i
  );
  return match ? match[1] : null;
}

/**
 * Format author name as "Last, F. I."
 */
function formatAuthor(author) {
  if (!author) return '';
  if (author.literal) return author.literal;
  const parts = [];
  if (author.family) parts.push(author.family);
  if (author.given) {
    const initials = author.given
      .split(/[\s-]+/)
      .map(n => n.charAt(0).toUpperCase() + '.')
      .join(' ');
    parts.push(initials);
  }
  return parts.join(', ');
}

/**
 * Fetch JSON from a URL with timeout and error handling
 */
async function fetchJSON(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Resolve DOI metadata via CrossRef, falling back to DataCite
 */
async function resolveDOI(doi) {
  const empty = { title: '', authors: '', journal: '', year: '' };

  // Try CrossRef first (journals, articles)
  const crossref = await fetchJSON(CROSSREF_API + encodeURIComponent(doi));
  if (crossref && crossref.message && crossref.message.title && crossref.message.title[0]) {
    const msg = crossref.message;
    const title = String(msg.title[0]);
    const authors = (msg.author || []).map(formatAuthor).filter(Boolean).join(', ');
    const journal = msg['container-title'] && msg['container-title'][0]
      ? String(msg['container-title'][0])
      : '';
    const issued = msg.issued && msg.issued['date-parts'] && msg.issued['date-parts'][0];
    const year = issued && issued[0] ? String(issued[0]) : '';

    console.log(`  CrossRef: ${doi} -> "${title.substring(0, 60)}..."`);
    return { title, authors, journal, year };
  }

  // Try DataCite (datasets, FDSN networks)
  const datacite = await fetchJSON(DATACITE_API + encodeURIComponent(doi));
  if (datacite && datacite.data && datacite.data.attributes) {
    const attrs = datacite.data.attributes;
    const titles = attrs.titles;
    if (titles && titles.length > 0 && titles[0].title) {
      const title = String(titles[0].title);
      const authors = (attrs.creators || [])
        .map(c => c.name || formatAuthor({ family: c.familyName, given: c.givenName }))
        .filter(Boolean)
        .join(', ');
      const journal = attrs.publisher ? String(attrs.publisher) : '';
      const year = attrs.publicationYear ? String(attrs.publicationYear) : '';

      console.log(`  DataCite: ${doi} -> "${title.substring(0, 60)}..."`);
      return { title, authors, journal, year };
    }
  }

  console.log(`  Unresolved: ${doi}`);
  return empty;
}

/**
 * Main: read data.json, resolve DOIs, write back
 */
async function main() {
  console.log('Reading data.json...');
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const data = JSON.parse(raw);

  if (!data.data || !Array.isArray(data.data)) {
    console.log('No project data found.');
    process.exit(0);
  }

  // Collect all unique DOIs and check which need resolving
  const doiCache = {};
  let totalDOIs = 0;
  let alreadyResolved = 0;

  for (const project of data.data) {
    if (!project.relatedObjects) continue;
    for (const obj of project.relatedObjects) {
      const doi = extractDOI(obj.identifier);
      if (!doi) continue;
      totalDOIs++;

      // Skip if already has metadata
      if (obj.title && obj.authors && obj.year) {
        doiCache[doi] = {
          title: obj.title,
          authors: obj.authors,
          journal: obj.journal || '',
          year: obj.year
        };
        alreadyResolved++;
        continue;
      }

      // Mark for resolution (avoid duplicates)
      if (!doiCache.hasOwnProperty(doi)) {
        doiCache[doi] = null; // Will be resolved
      }
    }
  }

  // Resolve unresolved DOIs
  const toResolve = Object.entries(doiCache).filter(([_, v]) => v === null);
  console.log(`Found ${totalDOIs} DOI references (${alreadyResolved} already resolved, ${toResolve.length} to resolve)`);

  for (const [doi] of toResolve) {
    doiCache[doi] = await resolveDOI(doi);
    await sleep(DELAY_MS);
  }

  // Apply resolved metadata back to all related objects
  let enrichedCount = 0;
  for (const project of data.data) {
    if (!project.relatedObjects) continue;
    for (const obj of project.relatedObjects) {
      const doi = extractDOI(obj.identifier);
      if (!doi || !doiCache[doi]) continue;

      const meta = doiCache[doi];
      if (meta.title) {
        obj.title = meta.title;
        obj.authors = meta.authors;
        obj.journal = meta.journal;
        obj.year = meta.year;
        enrichedCount++;
      }
    }
  }

  // Write back
  const output = JSON.stringify(data, null, 2);
  fs.writeFileSync(DATA_PATH, output, 'utf8');
  console.log(`Done. Enriched ${enrichedCount} DOI references across ${data.data.length} projects.`);

  // Exit with status indicating if changes were made
  if (toResolve.length > 0) {
    console.log('New DOIs were resolved — data.json updated.');
    process.exit(0);
  } else {
    console.log('No new DOIs to resolve — no changes needed.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
