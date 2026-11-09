import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDotenv, looksSecret, guessHosts, toName, mask } from '../src/dotenv.js';

test('parses .env syntax: comments, export, quotes, inline comments', () => {
  const env = parseDotenv([
    '# comment',
    'export STRIPE_SECRET_KEY=sk_test_123  # inline',
    'OPENAI_API_KEY="sk-abc \\"quoted\\""',
    "SINGLE='a # not a comment'",
    'MULTI="line1',
    'line2"',
    'PORT=3000',
    'EMPTY=',
    'PORT=4000',
  ].join('\n'));
  const m = Object.fromEntries(env.map((e) => [e.key, e.value]));
  assert.equal(m.STRIPE_SECRET_KEY, 'sk_test_123');
  assert.equal(m.OPENAI_API_KEY, 'sk-abc "quoted"');
  assert.equal(m.SINGLE, 'a # not a comment');
  assert.equal(m.MULTI, 'line1\nline2');
  assert.equal(m.PORT, '4000', 'later definitions win');
  assert.equal(m.EMPTY, '');
});

test('tells credentials apart from config', () => {
  assert.ok(looksSecret('STRIPE_SECRET_KEY', 'sk_test_1'));
  assert.ok(looksSecret('DATABASE_URL_TOKEN', 'abc'));
  assert.ok(looksSecret('SOMETHING', 'ghp_abcdefabcdef'));
  assert.ok(!looksSecret('PORT', '3000'));
  assert.ok(!looksSecret('NODE_ENV', 'production'));
  assert.ok(!looksSecret('NEXT_PUBLIC_API_KEY', 'pk_live_xyz'), 'public build-time vars are not secrets');
  assert.ok(!looksSecret('API_KEY', ''), 'empty values are skipped');
});

test('guesses provider hosts and names', () => {
  assert.deepEqual(guessHosts('STRIPE_SECRET_KEY'), ['api.stripe.com']);
  assert.deepEqual(guessHosts('ANTHROPIC_API_KEY'), ['api.anthropic.com']);
  assert.deepEqual(guessHosts('MY_RANDOM_TOKEN'), []);
  assert.equal(toName('STRIPE_SECRET_KEY'), 'stripe_secret_key');
  assert.equal(mask('sk_test_abcdefgh'), 'sk_t••••••••••••');
});

test('reads keys from a pasted note with titles', async () => {
  const { planImport } = await import('../src/dotenv.js');
  const note = [
    'My API keys', '',
    'Stripe: sk_live_FAKE51Habc123def456',
    'OpenAI - sk-proj-FAKEabc123def456ghi789',
    '• GitHub token ghp_FAKEaBcD1234567890xyz',
    'Resend', 're_FAKE_123456789abcdef', '',
    'Supabase', 'URL: https://abcdefgh.supabase.co', 'anon key: eyJhbGciOiJIUzI1NiFAKE.eyJyb2xlIjoiYW5vbiJ9.abc123',
    'Twilio', 'Account SID AC1234567890abcdef1234567890abcd', 'Auth token: 0123456789abcdef0123456789abcdef',
    'Gym locker code 1234',
    'Acme internal API: acme_9f8e7d6c5b4a39281706',
  ].join('\n');
  const got = Object.fromEntries(planImport(note).map((i) => [i.name, [i.envName, i.hosts.join(',')]]));
  assert.deepEqual(got.stripe, ['STRIPE_API_KEY', 'api.stripe.com']);
  assert.deepEqual(got.openai, ['OPENAI_API_KEY', 'api.openai.com']);
  assert.deepEqual(got.github, ['GITHUB_TOKEN', 'api.github.com']);
  assert.deepEqual(got.resend, ['RESEND_API_KEY', 'api.resend.com']);
  assert.deepEqual(got.supabase_anon, ['SUPABASE_ANON_KEY', '*.supabase.co']);
  assert.deepEqual(got.twilio_account_sid, ['TWILIO_ACCOUNT_SID', 'api.twilio.com']);
  assert.deepEqual(got.twilio, ['TWILIO_AUTH_TOKEN', 'api.twilio.com']);
  assert.deepEqual(got.acme_internal, ['ACME_INTERNAL_API_KEY', '']);
  assert.equal(Object.keys(got).length, 8, 'the URL and the locker code are not keys');
});

test('knows marketing, automation and other popular apps', async () => {
  const { planImport, guessHosts, looksLikeKey } = await import('../src/dotenv.js');
  const note = [
    'Klaviyo', 'Private key: pk_FAKEa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    'Mailchimp: FAKE0123456789abcdef0123456789ab-us21',
    'HubSpot private app: pat-na1-FAKE1234-5678-90ab-cdef-1234567890ab',
    'Apify: apify_api_FAKEabc123def456ghi789',
    'Make.com token: FAKEa1b2c3d4-e5f6-7890-abcd-ef1234567890',
  ].join('\n');
  const hosts = Object.fromEntries(planImport(note).map((i) => [i.name, i.hosts.join(',')]));
  assert.equal(hosts.klaviyo_private, 'a.klaviyo.com');
  assert.equal(hosts.mailchimp, '*.api.mailchimp.com');
  assert.equal(hosts.hubspot_private_app, 'api.hubapi.com');
  assert.equal(hosts.apify, 'api.apify.com');
  assert.equal(hosts.make_com, '*.make.com');
  // Whole-word matching: short names don't fire inside other words.
  assert.deepEqual(guessHosts('INBOX_TOKEN'), []);
  assert.deepEqual(guessHosts('BOX_TOKEN'), ['api.box.com']);
  assert.deepEqual(guessHosts('AZURE_OPENAI_KEY'), ['*.openai.azure.com']);
  // Ordinary long words are not keys, even if they start like a key prefix.
  assert.equal(looksLikeKey('skateboarding'), false);
  assert.equal(looksLikeKey('pk_FAKEa1b2c3d4e5f6a7b8'), true);
});
