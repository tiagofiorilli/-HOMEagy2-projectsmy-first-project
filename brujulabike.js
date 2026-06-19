
const https  = require('https');
const http   = require('http');
const fs     = require('fs');

// Helper to decode HTML entities and CDATA
function cleanText(str) {
  if (!str) return '';
  str = str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  str = str.replace(/<[^>]+>/g, '');
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

// Feed options
const FEEDS = {
  es: { url: 'https://feeds.feedburner.com/brujulabike',    name: 'Brujulabike (Español)',   lang: 'es-ES', srcLang: 'es' },
  en: { url: 'https://feeds.feedburner.com/brujulabike-en', name: 'Brujulabike (English)',    lang: 'en-US', srcLang: 'en' },
  br: { url: 'https://feeds.feedburner.com/brujulabike-br', name: 'Brujulabike (Português)',  lang: 'pt-BR', srcLang: 'pt' }
};

// Show help
function showHelp() {
  console.log(`
🚴  Brujulabike CLI Reader + Instagram Stories
───────────────────────────────────────────────────
Uso:  node brujulabike.js [opções]

Idioma do feed:
  --es        Espanhol (padrão)
  --en        Inglês
  --br        Português (Brasil)

Modos:
  --stories   Gera conteúdo traduzido para Stories do Instagram
  --output F  Salva os stories em um arquivo (ex: --output stories.txt)

Outras:
  --limit N   Número de artigos (padrão: 10)
  --help      Exibe esta ajuda
`);
  process.exit(0);
}

// ─── HTTP Fetch (com redirect) ────────────────────────────────────────────────

function fetchUrl(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
        'Accept': 'application/rss+xml, application/xml, application/json, text/xml, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7'
      }
    }, (res) => {
      const { statusCode, headers } = res;
      if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
        res.resume();
        if (redirectsLeft === 0) return reject(new Error('Too many redirects'));
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

// ─── Tradução via MyMemory (grátis, sem API key) ─────────────────────────────

async function translateText(text, fromLang = 'es', toLang = 'pt-BR') {
  if (!text || fromLang === 'pt') return text; // já está em português
  try {
    const encoded = encodeURIComponent(text.slice(0, 500)); // limite seguro
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${fromLang}|${toLang}`;
    const raw  = await fetchUrl(url);
    const data = JSON.parse(raw);
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
  } catch (_) {}
  return text; // fallback: texto original
}

// Pausa entre chamadas para não exceder rate limit da API gratuita
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Parse RSS ────────────────────────────────────────────────────────────────

function parseRSS(xml, limit, lang) {
  const items = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const block = match[1];

    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch  = block.match(/<link>([\s\S]*?)<\/link>/i) ||
                       block.match(/<link\s+href="([^"]+)"/i);
    const catMatch   = block.match(/<category[^>]*>([\s\S]*?)<\/category>/i);
    const dateMatch  = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const descMatch  = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);

    if (!titleMatch || !linkMatch) continue;

    const title    = cleanText(titleMatch[1]);
    const category = cleanText(catMatch ? catMatch[1] : '');

    let pubDate = '';
    if (dateMatch) {
      try {
        pubDate = new Date(dateMatch[1]).toLocaleString(lang, {
          day: '2-digit', month: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });
      } catch (_) {}
    }

    let desc = '';
    if (descMatch) {
      desc = cleanText(descMatch[1]);
      if (desc.length > 150) desc = desc.slice(0, 147) + '...';
    }

    items.push({ title, link: linkMatch[1].trim(), category, pubDate, desc });
  }

  return items;
}

// ─── Print normal ─────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  'mountain bike': '\x1b[91m',
  'mtb':           '\x1b[91m',
  'carretera':     '\x1b[94m',
  'road':          '\x1b[94m',
  'gravel':        '\x1b[93m',
  'e-bike':        '\x1b[96m',
  'electricas':    '\x1b[96m',
  'default':       '\x1b[92m'
};

function categoryColor(cat) {
  const lower = (cat || '').toLowerCase();
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return CATEGORY_COLORS.default;
}

function printArticles(items, feed) {
  const line = '═'.repeat(70);
  console.log('\n' + line);
  console.log(`  🚴  BRUJULABIKE — ${feed.name.toUpperCase()}`);
  console.log(line + '\n');

  items.forEach((item, i) => {
    const num   = String(i + 1).padStart(2, ' ');
    const color = categoryColor(item.category);
    console.log(`\x1b[1m\x1b[36m${num}. ${item.title}\x1b[0m`);
    if (item.category) {
      console.log(`    ${color}🏷  ${item.category}\x1b[0m${item.pubDate ? '  · ' + item.pubDate : ''}`);
    } else if (item.pubDate) {
      console.log(`    \x1b[33m🕐 ${item.pubDate}\x1b[0m`);
    }
    if (item.desc) console.log(`    \x1b[37m${item.desc}\x1b[0m`);
    console.log(`    \x1b[90m${item.link}\x1b[0m`);
    console.log();
  });

  console.log('═'.repeat(70));
  console.log(`  🌐  Fonte: https://www.brujulabike.com/`);
  console.log('═'.repeat(70) + '\n');
}

// ─── Geração de Stories para Instagram ───────────────────────────────────────

// Mapeamento de categoria → hashtags + emoji
const CATEGORY_STORY = {
  'mountain bike': { emoji: '🚵',  tags: '#MTB #MountainBike #Trilha #DownHill' },
  'mtb':           { emoji: '🚵',  tags: '#MTB #MountainBike #Trilha #DownHill' },
  'carretera':     { emoji: '🏆',  tags: '#Ciclismo #SpeedBike #Estrada #PelotonLife' },
  'road':          { emoji: '🏆',  tags: '#Ciclismo #SpeedBike #Estrada #PelotonLife' },
  'gravel':        { emoji: '🌄',  tags: '#Gravel #GravelBike #Aventura #OffRoad' },
  'electricas':    { emoji: '⚡',  tags: '#EBike #BicicletaEletrica #Eletrica #FuturoSobreRodas' },
  'e-bike':        { emoji: '⚡',  tags: '#EBike #BicicletaEletrica #Eletrica #FuturoSobreRodas' },
  'default':       { emoji: '🚴',  tags: '#Ciclismo #Bicicleta #BikeLife' },
};

function getCategoryStory(cat) {
  const lower = (cat || '').toLowerCase();
  for (const [key, val] of Object.entries(CATEGORY_STORY)) {
    if (lower.includes(key)) return val;
  }
  return CATEGORY_STORY.default;
}

// Frases de CTA para variar
const CTAS = [
  'Quer saber mais? Link na bio! 🔗',
  'Confira a matéria completa! Link na bio 👆',
  'Não perde essa! Link na bio 👆',
  'Leia a matéria completa no link da bio! 📲',
  'Saiba tudo sobre isso. Link na bio! 🔗',
];

function generateStory(item, index, sourceName) {
  const { title, desc, link, category, pubDate } = item;
  const { emoji, tags } = getCategoryStory(category);
  const cta  = CTAS[index % CTAS.length];
  const num  = String(index + 1).padStart(2, '0');
  const sep  = '─'.repeat(44);

  const catLine = category
    ? `📂 ${category.toUpperCase()}`
    : '🚴 CICLISMO';

  const descLine = desc ? `\n💬 ${desc}\n` : '';

  return [
    `╔════════════════════════════════════════════╗`,
    `║  📱 STORY #${num}                               ║`,
    `╚════════════════════════════════════════════╝`,
    ``,
    `${emoji} ${title.toUpperCase()}`,
    ``,
    `${sep}`,
    `${catLine}${pubDate ? '  ·  🕐 ' + pubDate : ''}`,
    `${sep}`,
    descLine,
    `${cta}`,
    ``,
    `${tags}`,
    `#BrujulaBike #VidaDeCiclista #BikeLife #Pedal`,
    ``,
    `[ Fonte: ${sourceName} ]`,
    `[ Link: ${link} ]`,
  ].join('\n');
}

// Traduz todos os itens e gera stories
async function generateAllStories(items, feed) {
  const sourceName = 'BrujulaBike.com';
  const stories    = [];
  const total      = items.length;

  console.log(`\n🌐 Traduzindo e gerando ${total} stories para o Instagram...\n`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    process.stdout.write(`  [${i + 1}/${total}] Traduzindo: "${item.title.slice(0, 50)}..."  `);

    // Traduz título e descrição (se o feed não for pt-BR)
    const [titlePt, descPt] = await Promise.all([
      translateText(item.title, feed.srcLang, 'pt-BR'),
      translateText(item.desc,  feed.srcLang, 'pt-BR'),
    ]);

    process.stdout.write('✅\n');

    const translatedItem = { ...item, title: titlePt, desc: descPt };
    stories.push(generateStory(translatedItem, i, sourceName));

    // Pequena pausa para respeitar o rate limit gratuito da API
    if (i < items.length - 1) await sleep(400);
  }

  return stories;
}

function printStories(stories) {
  const divider = '\n' + '═'.repeat(48) + '\n';
  console.log(divider);
  console.log('  📱  STORIES GERADOS PARA O INSTAGRAM');
  console.log('═'.repeat(48) + '\n');
  stories.forEach(s => {
    console.log(s);
    console.log('\n' + '─'.repeat(48) + '\n');
  });
}

function saveStories(stories, filename) {
  const divider = '\n' + '═'.repeat(48) + '\n';
  const header  = `BRUJULABIKE — Stories para Instagram\nGerado em: ${new Date().toLocaleString('pt-BR')}\n`;
  const content = header + divider + stories.join('\n\n' + '─'.repeat(48) + '\n\n');
  fs.writeFileSync(filename, content, 'utf8');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) showHelp();

  // Idioma do feed
  let feedKey = 'es';
  if (args.includes('--en')) feedKey = 'en';
  else if (args.includes('--br')) feedKey = 'br';

  // Limite de artigos
  let limit = 5; // padrão menor no modo stories para não exceder API
  const li  = args.indexOf('--limit');
  if (li !== -1 && args[li + 1]) {
    const n = parseInt(args[li + 1], 10);
    if (!isNaN(n) && n > 0) limit = n;
  }

  // Modo stories
  const storiesMode = args.includes('--stories');

  // Arquivo de saída
  let outputFile = null;
  const oi = args.indexOf('--output');
  if (oi !== -1 && args[oi + 1]) outputFile = args[oi + 1];

  const feed = FEEDS[feedKey];

  process.stdout.write(`⚡ Buscando os ${limit} artigos mais recentes de ${feed.name}...\n`);

  try {
    const xml = await fetchUrl(feed.url);

    if (!xml.includes('<item')) {
      console.error('❌ Feed inesperado. Resposta:\n', xml.slice(0, 500));
      process.exit(1);
    }

    const items = parseRSS(xml, limit, feed.lang);

    if (items.length === 0) {
      console.error('❌ Nenhum artigo encontrado. O formato do feed pode ter mudado.');
      process.exit(1);
    }

    // Sempre mostra o resumo das notícias
    printArticles(items, feed);

    // Modo stories ativado
    if (storiesMode) {
      const stories = await generateAllStories(items, feed);
      printStories(stories);

      if (outputFile) {
        saveStories(stories, outputFile);
        console.log(`\n💾 Stories salvos em: ${outputFile}\n`);
      }
    }

  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

main();
