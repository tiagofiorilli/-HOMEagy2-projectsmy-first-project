

const https = require('https');
const http = require('http');

// Helper to decode HTML entities and CDATA
function cleanText(str) {
  if (!str) return '';
  // Unwrap CDATA
  str = str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Decode HTML entities
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2013;/g, '-')
    .replace(/&#x2014;/g, '--')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .trim();
}

// Config mappings for regions
const REGIONS = {
  us: { hl: 'en-US', gl: 'US', ceid: 'US:en',    name: 'Estados Unidos (Inglês)' },
  br: { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt',    name: 'Brasil (Português)'       },
  pt: { hl: 'pt-PT', gl: 'PT', ceid: 'PT:pt',    name: 'Portugal (Português)'     },
  gb: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en',    name: 'Reino Unido (Inglês)'     }
};

// Show help
function showHelp() {
  console.log(`
📰  Google News CLI Reader
───────────────────────────────────────────
Uso:  node news.js [opções]

Região:
  --br      Brasil em Português  (padrão)
  --us      Estados Unidos em Inglês
  --pt      Portugal em Português
  --gb      Reino Unido em Inglês

Outras:
  --limit N  Número de notícias (padrão: 10)
  --help     Exibe esta ajuda
`);
  process.exit(0);
}

// Fetch URL following redirects
function fetchUrl(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      }
    }, (res) => {
      const { statusCode, headers } = res;

      // Follow redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
        res.resume();
        if (redirectsLeft === 0) {
          return reject(new Error('Too many redirects'));
        }
        return resolve(fetchUrl(headers.location, redirectsLeft - 1));
      }

      if (statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${statusCode}`));
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.end();
  });
}

// Parse RSS XML and extract items
function parseRSS(xml, limit) {
  const items = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const block = match[1];

    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch  = block.match(/<link>([\s\S]*?)<\/link>/i) ||
                       block.match(/<link\s+href="([^"]+)"/i);
    const srcMatch   = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const dateMatch  = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

    if (!titleMatch || !linkMatch) continue;

    let title = cleanText(titleMatch[1]);
    const source = cleanText(srcMatch ? srcMatch[1] : '');

    // Google News RSS appends " - Source Name" to the title
    if (source && title.endsWith(' - ' + source)) {
      title = title.slice(0, -(source.length + 3));
    }

    let pubDate = '';
    if (dateMatch) {
      try {
        pubDate = new Date(dateMatch[1]).toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });
      } catch (_) {}
    }

    items.push({ title, link: linkMatch[1].trim(), source, pubDate });
  }

  return items;
}

// Pretty print
function printNews(items, region) {
  const line = '═'.repeat(68);
  console.log('\n' + line);
  console.log(`  📰  PRINCIPAIS NOTÍCIAS — ${region.name.toUpperCase()}`);
  console.log(line + '\n');

  items.forEach((item, i) => {
    const num = String(i + 1).padStart(2, ' ');
    console.log(`\x1b[1m\x1b[36m${num}. ${item.title}\x1b[0m`);
    if (item.source) {
      console.log(`    \x1b[33m📌 ${item.source}\x1b[0m${item.pubDate ? '  · ' + item.pubDate : ''}`);
    }
    console.log(`    \x1b[90m${item.link}\x1b[0m`);
    console.log();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) showHelp();

  let regionKey = 'br';
  if (args.includes('--us')) regionKey = 'us';
  else if (args.includes('--pt')) regionKey = 'pt';
  else if (args.includes('--gb')) regionKey = 'gb';

  let limit = 10;
  const li = args.indexOf('--limit');
  if (li !== -1 && args[li + 1]) {
    const n = parseInt(args[li + 1], 10);
    if (!isNaN(n) && n > 0) limit = n;
  }

  const region = REGIONS[regionKey];
  const url = `https://news.google.com/rss?hl=${region.hl}&gl=${region.gl}&ceid=${region.ceid}`;

  process.stdout.write(`⚡ Buscando as ${limit} notícias mais recentes de ${region.name}...\n`);

  try {
    const xml = await fetchUrl(url);

    if (!xml.includes('<item')) {
      // Debug: show first 500 chars of response
      console.error('❌ Feed inesperado. Resposta:\n', xml.slice(0, 500));
      process.exit(1);
    }

    const items = parseRSS(xml, limit);

    if (items.length === 0) {
      console.error('❌ Nenhuma notícia encontrada. O formato do feed pode ter mudado.');
      process.exit(1);
    }

    printNews(items, region);

  } catch (err) {
    console.error('❌ Erro ao buscar notícias:', err.message);
    process.exit(1);
  }
}

main();
