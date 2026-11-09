// Reading .env files so keys can be checked in to Doorman in one go.

/** Parse .env text into [{ key, value }]. Handles comments, `export`, and quotes. */
export function parseDotenv(text) {
  const out = [];
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let raw = m[2];
    let value;
    const q = raw[0];
    if (q === '"' || q === "'" || q === '`') {
      // Quoted values may span lines.
      let body = raw.slice(1);
      while (!hasClosingQuote(body, q) && i + 1 < lines.length) body += '\n' + lines[++i];
      const end = closingQuoteIndex(body, q);
      value = end >= 0 ? body.slice(0, end) : body;
      if (q === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\(["\\])/g, '$1');
    } else {
      value = raw.replace(/\s+#.*$/, '').trim();
    }
    out.push({ key, value });
  }
  // Later definitions win, like dotenv.
  const seen = new Map();
  for (const e of out) seen.set(e.key, e);
  return [...seen.values()];
}

function closingQuoteIndex(s, q) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && q === '"') { i++; continue; }
    if (s[i] === q) return i;
  }
  return -1;
}
const hasClosingQuote = (s, q) => closingQuoteIndex(s, q) >= 0;

const SECRET_WORDS = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|AUTH|CREDENTIAL|PRIVATE|DSN|WEBHOOK|SIGNING|ACCESS|API)/i;
const NOT_SECRET = /^(NODE_ENV|PORT|HOST|HOSTNAME|DEBUG|LOG_LEVEL|TZ|ENV|ENVIRONMENT|APP_ENV|APP_NAME|NEXT_PUBLIC_.*|VITE_.*|PUBLIC_.*|REACT_APP_.*)$/i;

/** Does this variable look like a credential (vs config like PORT=3000)? */
export function looksSecret(key, value) {
  if (!value) return false;
  if (NOT_SECRET.test(key)) return false;
  if (SECRET_WORDS.test(key)) return true;
  if (/^(sk|pk|rk|ghp|gho|ghs|github_pat|xox[abpr]|AKIA|AIza|hf|glpat|re|SG\.)[-_]/.test(value)) return true;
  return value.length >= 32 && /^[A-Za-z0-9_\-./+=:]+$/.test(value) && !/^https?:\/\//.test(value);
}

// Well-known services: which API host(s) a key for them should be sent to.
// Each entry: [names as they appear in variable names or note titles, hosts].
// Names are matched as whole words (KLAVIYO_PRIVATE_KEY, "Klaviyo key"), so
// short names like BOX or FLY don't match inside other words. More specific
// entries come first (AZURE_OPENAI before OPENAI, GOOGLE_MAPS before GOOGLE).
const SERVICES = [
  // AI models and tools
  [['AZURE_OPENAI'], ['*.openai.azure.com']],
  [['OPENAI'], ['api.openai.com']],
  [['ANTHROPIC', 'CLAUDE'], ['api.anthropic.com']],
  [['OPENROUTER'], ['openrouter.ai']],
  [['GEMINI', 'GOOGLE_AI', 'GOOGLE_GENERATIVE_AI', 'AI_STUDIO'], ['generativelanguage.googleapis.com']],
  [['GROQ'], ['api.groq.com']],
  [['MISTRAL'], ['api.mistral.ai']],
  [['DEEPSEEK'], ['api.deepseek.com']],
  [['PERPLEXITY', 'PPLX'], ['api.perplexity.ai']],
  [['COHERE'], ['api.cohere.com']],
  [['XAI', 'GROK'], ['api.x.ai']],
  [['TOGETHER', 'TOGETHER_AI'], ['api.together.xyz']],
  [['FIREWORKS'], ['api.fireworks.ai']],
  [['REPLICATE'], ['api.replicate.com']],
  [['HUGGINGFACE', 'HUGGING_FACE', 'HF'], ['huggingface.co', '*.huggingface.co']],
  [['ELEVENLABS', 'ELEVEN_LABS', 'ELEVEN'], ['api.elevenlabs.io']],
  [['DEEPGRAM'], ['api.deepgram.com']],
  [['ASSEMBLYAI', 'ASSEMBLY_AI', 'ASSEMBLY'], ['api.assemblyai.com']],
  [['STABILITY', 'STABILITY_AI'], ['api.stability.ai']],
  [['FAL', 'FAL_AI'], ['fal.run', '*.fal.run']],
  [['RUNWAY', 'RUNWAYML'], ['api.dev.runwayml.com']],
  [['LUMA', 'LUMA_AI'], ['api.lumalabs.ai']],
  [['HEYGEN'], ['api.heygen.com']],
  [['VOYAGE'], ['api.voyageai.com']],
  [['JINA'], ['*.jina.ai']],
  [['PINECONE'], ['*.pinecone.io']],
  [['LANGSMITH', 'LANGCHAIN'], ['api.smith.langchain.com']],
  // Scraping and search
  [['APIFY'], ['api.apify.com']],
  [['FIRECRAWL'], ['api.firecrawl.dev']],
  [['SERPAPI', 'SERP_API'], ['serpapi.com']],
  [['TAVILY'], ['api.tavily.com']],
  [['EXA'], ['api.exa.ai']],
  [['BRAVE', 'BRAVE_SEARCH'], ['api.search.brave.com']],
  [['BROWSERLESS'], ['*.browserless.io']],
  [['SCRAPINGBEE'], ['app.scrapingbee.com']],
  // Email and marketing
  [['KLAVIYO'], ['a.klaviyo.com']],
  [['MAILCHIMP'], ['*.api.mailchimp.com']],
  [['SENDGRID'], ['api.sendgrid.com']],
  [['RESEND'], ['api.resend.com']],
  [['MAILGUN'], ['api.mailgun.net', 'api.eu.mailgun.net']],
  [['POSTMARK'], ['api.postmarkapp.com']],
  [['BREVO', 'SENDINBLUE'], ['api.brevo.com']],
  [['CONVERTKIT', 'KIT'], ['api.convertkit.com', 'api.kit.com']],
  [['BEEHIIV'], ['api.beehiiv.com']],
  [['LOOPS'], ['app.loops.so']],
  [['CUSTOMERIO', 'CUSTOMER_IO'], ['*.customer.io']],
  [['ACTIVECAMPAIGN', 'ACTIVE_CAMPAIGN'], ['*.api-us1.com']],
  [['OMNISEND'], ['api.omnisend.com']],
  [['ATTENTIVE'], ['api.attentivemobile.com']],
  [['POSTSCRIPT'], ['api.postscript.io']],
  // CRM, sales and support
  [['HUBSPOT'], ['api.hubapi.com']],
  [['SALESFORCE', 'SFDC'], ['*.salesforce.com', '*.my.salesforce.com']],
  [['PIPEDRIVE'], ['api.pipedrive.com', '*.pipedrive.com']],
  [['ATTIO'], ['api.attio.com']],
  [['CLOSE', 'CLOSE_CRM'], ['api.close.com']],
  [['APOLLO'], ['api.apollo.io']],
  [['GONG'], ['*.api.gong.io']],
  [['INTERCOM'], ['api.intercom.io']],
  [['ZENDESK'], ['*.zendesk.com']],
  [['FRESHDESK'], ['*.freshdesk.com']],
  [['GORGIAS'], ['*.gorgias.com']],
  [['LEMLIST'], ['api.lemlist.com']],
  [['INSTANTLY'], ['api.instantly.ai']],
  [['HUNTER'], ['api.hunter.io']],
  [['CLEARBIT'], ['*.clearbit.com']],
  // Commerce and payments
  [['STRIPE'], ['api.stripe.com']],
  [['SHOPIFY'], ['*.myshopify.com']],
  [['SQUARE'], ['connect.squareup.com', 'connect.squareupsandbox.com']],
  [['PAYPAL'], ['api-m.paypal.com', 'api-m.sandbox.paypal.com']],
  [['LEMONSQUEEZY', 'LEMON_SQUEEZY'], ['api.lemonsqueezy.com']],
  [['PADDLE'], ['api.paddle.com', 'sandbox-api.paddle.com']],
  [['GUMROAD'], ['api.gumroad.com']],
  [['RECHARGE'], ['api.rechargeapps.com']],
  [['PLAID'], ['*.plaid.com']],
  // Productivity and content
  [['NOTION'], ['api.notion.com']],
  [['AIRTABLE'], ['api.airtable.com']],
  [['ASANA'], ['app.asana.com']],
  [['CLICKUP'], ['api.clickup.com']],
  [['MONDAY'], ['api.monday.com']],
  [['TRELLO'], ['api.trello.com']],
  [['LINEAR'], ['api.linear.app']],
  [['JIRA', 'ATLASSIAN', 'CONFLUENCE'], ['*.atlassian.net', 'api.atlassian.com']],
  [['TODOIST'], ['api.todoist.com']],
  [['CALENDLY'], ['api.calendly.com']],
  [['CALCOM', 'CAL_COM'], ['api.cal.com']],
  [['TYPEFORM'], ['api.typeform.com']],
  [['TALLY'], ['api.tally.so']],
  [['ZOOM'], ['api.zoom.us']],
  [['DROPBOX'], ['api.dropboxapi.com', 'content.dropboxapi.com']],
  [['BOX'], ['api.box.com']],
  [['FIGMA'], ['api.figma.com']],
  [['CANVA'], ['api.canva.com']],
  [['MIRO'], ['api.miro.com']],
  [['WEBFLOW'], ['api.webflow.com']],
  [['CONTENTFUL'], ['*.contentful.com']],
  [['SANITY'], ['*.sanity.io']],
  // Automation
  [['ZAPIER'], ['*.zapier.com']],
  [['MAKE', 'INTEGROMAT'], ['*.make.com']],
  [['PIPEDREAM'], ['api.pipedream.com']],
  // Developer tools and infrastructure
  [['GITHUB', 'GH'], ['api.github.com']],
  [['GITLAB'], ['gitlab.com']],
  [['VERCEL'], ['api.vercel.com']],
  [['NETLIFY'], ['api.netlify.com']],
  [['CLOUDFLARE', 'CF'], ['api.cloudflare.com']],
  [['DIGITALOCEAN', 'DIGITAL_OCEAN'], ['api.digitalocean.com']],
  [['HEROKU'], ['api.heroku.com']],
  [['RENDER'], ['api.render.com']],
  [['RAILWAY'], ['backboard.railway.app']],
  [['FLY', 'FLY_IO'], ['api.machines.dev', 'api.fly.io']],
  [['SUPABASE'], ['*.supabase.co']],
  [['FIREBASE'], ['*.googleapis.com', '*.firebaseio.com']],
  [['NEON'], ['console.neon.tech']],
  [['UPSTASH'], ['*.upstash.io']],
  [['PLANETSCALE'], ['api.planetscale.com']],
  [['MONGODB', 'MONGO', 'ATLAS'], ['cloud.mongodb.com']],
  [['ALGOLIA'], ['*.algolia.net', '*.algolianet.com']],
  [['SENTRY'], ['sentry.io', '*.sentry.io']],
  [['POSTHOG'], ['*.posthog.com']],
  [['MIXPANEL'], ['*.mixpanel.com']],
  [['AMPLITUDE'], ['*.amplitude.com']],
  [['SEGMENT'], ['api.segment.io']],
  [['DATADOG', 'DD'], ['*.datadoghq.com']],
  [['CLOUDINARY'], ['api.cloudinary.com']],
  [['UPLOADTHING'], ['*.uploadthing.com']],
  [['NPM'], ['registry.npmjs.org']],
  [['DOCKER', 'DOCKERHUB'], ['hub.docker.com']],
  [['AWS'], ['*.amazonaws.com']],
  [['GOOGLE_MAPS', 'MAPS'], ['maps.googleapis.com']],
  [['MAPBOX'], ['api.mapbox.com']],
  [['YOUTUBE'], ['*.googleapis.com']],
  [['GOOGLE', 'GCP'], ['*.googleapis.com']],
  // Messaging and social
  [['SLACK'], ['slack.com']],
  [['DISCORD'], ['discord.com']],
  [['TELEGRAM'], ['api.telegram.org']],
  [['TWILIO'], ['api.twilio.com']],
  [['WHATSAPP', 'META', 'FACEBOOK', 'FB', 'INSTAGRAM', 'IG'], ['graph.facebook.com', 'graph.instagram.com']],
  [['TWITTER', 'X'], ['api.twitter.com', 'api.x.com']],
  [['LINKEDIN'], ['api.linkedin.com']],
  [['REDDIT'], ['oauth.reddit.com']],
  [['TIKTOK'], ['open.tiktokapis.com', 'business-api.tiktok.com']],
  [['PINTEREST'], ['api.pinterest.com']],
  [['SPOTIFY'], ['api.spotify.com']],
];

const PROVIDERS = SERVICES.map(([names, hosts]) => [new RegExp('(^|_)(' + names.join('|') + ')(_|$)', 'i'), hosts]);

export function guessHosts(key) {
  const k = String(key).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  for (const [re, hosts] of PROVIDERS) if (re.test(k)) return hosts;
  return [];
}

export const KNOWN_SERVICES = SERVICES.length;

/** STRIPE_SECRET_KEY -> stripe_secret_key (a Doorman tag name). */
export function toName(key) {
  return key.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^[_-]+|[_-]+$/g, '').slice(0, 64) || 'key';
}

export function mask(value) {
  if (!value) return '';
  if (value.length <= 8) return '•'.repeat(value.length);
  return value.slice(0, 4) + '•'.repeat(Math.min(12, value.length - 4));
}

/** STRIPE_SECRET_KEY -> stripe, OPENAI_API_KEY -> openai (a friendly tag name). */
export function shortName(key) {
  const trimmed = key.replace(/[_-]?(API[_-]?KEY|SECRET[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|API[_-]?TOKEN|KEY|TOKEN|SECRET)$/i, '');
  return toName(trimmed || key);
}

/** Preview of an import: what Doorman would check in. Values never leave here. */
export function planImport(text, existingNames = new Set()) {
  const entries = parseAny(text);
  const shortCount = new Map();
  for (const { key } of entries) shortCount.set(shortName(key), (shortCount.get(shortName(key)) || 0) + 1);
  return entries.map(({ key, value }) => {
    // Use the short name unless two variables in this file share it. (Each
    // client has its own room, so an existing key with that name in the same
    // room is simply updated; `exists` warns about it on the review screen.)
    const short = shortName(key);
    const name = shortCount.get(short) === 1 ? short : toName(key);
    return {
      key, name, envName: key.replace(/[^A-Za-z0-9_]/g, '_'),
      hosts: guessHosts(key), secret: entries.fromNotes ? true : looksSecret(key, value), exists: existingNames.has(name),
      masked: mask(value), empty: !value, title: entries.find((e) => e.key === key)?.title || '',
    };
  });
}

// ---- Free-form notes ("Stripe: sk_live_…", or a title line then the key) ----

const KNOWN_PREFIX = /^(sk|pk|rk|ghp|gho|ghs|ghu|github_pat|xox[abpr]|AKIA|ASIA|AIza|hf|glpat|re|SG|eyJ|key|tok|pat|whsec|shpat|shpss|shpca|ntn|secret|lin_api|tvly|fc|apify_api|phc|phx|figd|dop_v1|gsk|xai|r8|sbp|sq0atp|sq0csp|sntrys|npm|pypi|dckr_pat|cfut)[-_.]|^EAA[A-Za-z0-9]{20,}/;
const LABEL_WORDS = /(key|token|secret|password|passwd|pwd|pat|credential|auth)/i;
const GENERIC_LABEL = /^(api[\s_-]*)?(key|token|secret|password|pwd|pat|credentials?|auth|anon[\s_-]*key|service[\s_-]*(role[\s_-]*)?key|public[\s_-]*key|private[\s_-]*key|secret[\s_-]*key|access[\s_-]*(key|token)|client[\s_-]*(id|secret)|value)$/i;

/** Does this word look like an API key / token (not a URL, email or ordinary word)? */
export function looksLikeKey(word) {
  if (!word || /\s/.test(word) || word.includes('@') || word.includes('//')) return false;
  if (KNOWN_PREFIX.test(word) && word.length >= 12) return true;
  if (word.length < 20 || !/^[A-Za-z0-9_\-./+=:]+$/.test(word)) return false;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(word)) return false; // a domain / URL path
  return /[0-9]/.test(word) && /[A-Za-z]/.test(word);
}

function cleanLabel(s) {
  return s.replace(/^[\s>*•·\-–—#\d.)]+/, '').replace(/[\s:=\-–—|>→]+$/, '').replace(/[*_`"']/g, '').trim();
}

/** "Supabase anon key" -> SUPABASE_ANON_KEY; "Stripe" -> STRIPE_API_KEY. */
export function titleToEnv(title) {
  let env = title.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!env) env = 'API_KEY';
  if (/^[0-9]/.test(env)) env = 'KEY_' + env;
  if (/_API$/.test(env) || env === 'API') env += '_KEY';
  else if (!/(KEY|TOKEN|SECRET|PASSWORD|PAT|PWD|CREDENTIALS?|SID|ID)$/.test(env)) env += '_API_KEY';
  return env.slice(0, 120);
}

/**
 * Pull keys out of a pasted note. Understands:
 *   Stripe: sk_live_…          OpenAI - sk-…          GitHub token ghp_…
 *   Resend                      Supabase
 *   re_123…                     anon key: eyJ…   (titled "Supabase anon key")
 */
export function parseNotes(text) {
  const out = [];
  let section = '';
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { section = ''; continue; } // a blank line ends a group
    const words = line.split(/[\s,;]+|(?<=:)(?=\S)/);
    let keyWord = words.map((w) => w.replace(/^["'`(<\[]+|["'`)>\].,;]+$/g, '').replace(/^.*?[:=](?=\S{12,}$)/, '')).find(looksLikeKey);
    let label = '';
    if (keyWord) {
      label = cleanLabel(line.slice(0, line.indexOf(keyWord)));
    } else {
      // "Password: hunter2-long" style: a label that says key/token/password, then one value.
      const m = line.match(/^(.{1,60}?)\s*[:=]\s*(\S{8,})$/);
      if (m && LABEL_WORDS.test(m[1]) && !/^https?:/i.test(m[2])) { keyWord = m[2]; label = cleanLabel(m[1]); }
    }
    if (!keyWord) {
      // A heading line (no key on it) becomes the title for the keys below it.
      // ("URL: https://…" or "Region = us-east" are details, not headings.)
      const isDetail = /\S\s*[:=]\s*\S/.test(line);
      const heading = cleanLabel(line);
      const titleLike = heading && heading.length <= 40 && heading.split(/\s+/).length <= 5 && !/\d{3,}/.test(heading);
      if (!isDetail) section = titleLike ? heading : ''; // details keep the current heading
      continue;
    }
    // Prefix the group heading unless the label already names its service.
    let title = label;
    if (!title) title = section;
    else if (section && !title.toLowerCase().includes(section.toLowerCase()) &&
      (GENERIC_LABEL.test(title) || title.length <= 3 || !guessHosts(title.toUpperCase().replace(/[^A-Z0-9]+/g, '_')).length)) {
      title = section + ' ' + title;
    }
    out.push({ key: titleToEnv(title || 'Key ' + (out.length + 1)), value: keyWord, title: title || '' });
  }
  // Same title twice: number them so nothing is lost.
  const seen = new Map();
  for (const e of out) {
    const n = (seen.get(e.key) || 0) + 1;
    seen.set(e.key, n);
    if (n > 1) e.key = e.key + '_' + n;
  }
  return out;
}

/** .env text or a pasted note: pick the right reader. */
export function parseAny(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const envLike = lines.filter((l) => /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=/.test(l)).length;
  if (lines.length && envLike / lines.length >= 0.6) return parseDotenv(text);
  const notes = parseNotes(text);
  notes.fromNotes = true;
  return notes;
}
