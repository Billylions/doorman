import { appIconSvg } from './icon.js';

// The Doorman front desk. Plain HTML/CSS/JS, no external requests.
// Brand: a hotel front desk. Keys are leather room-key fobs on a key rack,
// adding a key is "checking it in", activity is the guest book.
// (No backticks or dollar-brace sequences below: this is a template literal.)
const RAW = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Doorman</title>
<style>
  :root {
    --lobby: #fff7e6; --card: #ffffff; --ink: #2a1a12; --muted: #8a6f5a; --line: #f0dfbd;
    --red: #d7262e; --red-dark: #a8161e; --gold: #ffc23a; --gold-dark: #e09a00; --cream: #fff3d6;
    --serif: "New York", ui-serif, Georgia, serif;
    --mono: ui-monospace, "SF Mono", Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root { --lobby: #1b0f10; --card: #26171a; --ink: #fbefd9; --muted: #c4a58c; --line: #3d2528; --cream: #3a2417; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--lobby); color: var(--ink);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

  /* Striped hotel awning with a scalloped edge */
  .awning { position: sticky; top: 0; z-index: 20; height: 46px;
    background: repeating-linear-gradient(90deg, var(--red) 0 28px, #fff3d6 28px 56px); }
  .awning::after { content: ""; position: absolute; left: 0; right: 0; bottom: -13px; height: 14px;
    background: radial-gradient(circle at 14px 0, var(--red) 13px, transparent 13.5px) 0 0 / 56px 14px repeat-x,
                radial-gradient(circle at 42px 0, #fff3d6 13px, transparent 13.5px) 0 0 / 56px 14px repeat-x; }

  main { max-width: 820px; margin: 0 auto; padding: 44px 20px 64px; }

  /* Lobby header */
  .lobby { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 30px; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand svg { width: 64px; height: 64px; flex: none; filter: drop-shadow(0 6px 10px rgba(168,22,30,.25)); }
  h1 { font-family: var(--serif); font-size: 34px; line-height: 1.1; margin: 0; }
  .tag { margin: 2px 0 0; color: var(--muted); }
  button { font: inherit; cursor: pointer; }
  .bell { display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 999px; padding: 11px 20px 11px 16px;
    background: var(--red); color: #fff; font-weight: 650; box-shadow: inset 0 -3px 0 var(--gold), 0 6px 14px -6px rgba(168,22,30,.6); }
  .bell:hover { filter: brightness(1.07); }
  .bell svg { width: 20px; height: 20px; }

  h2 { font-family: var(--serif); font-size: 20px; margin: 0 0 16px; display: flex; align-items: baseline; gap: 10px; }
  h2 small { font-family: -apple-system, sans-serif; font-size: 13px; font-weight: 400; color: var(--muted); }

  /* Key rack: brass rail with paper hotel tags (like a luggage claim tag) */
  .rack { position: relative; padding-top: 14px; display: grid; grid-template-columns: repeat(auto-fill, minmax(176px, 196px)); gap: 26px 14px; }
  .rack::before { content: ""; position: absolute; left: -6px; right: -6px; top: 0; height: 8px; border-radius: 4px;
    background: linear-gradient(#ffd977, var(--gold-dark)); box-shadow: 0 2px 4px rgba(0,0,0,.15); }
  .fob { --paper: #fbf1dc; --paper-ink: #2a1a12; --paper-muted: #8a6f5a; --paper-line: #e3cfa6; --leather: #d7262e;
    position: relative; padding-top: 22px; display: flex; flex-direction: column; transform-origin: 50% 0; transition: transform .2s ease;
    filter: drop-shadow(0 10px 14px rgba(0,0,0,.28)); }
  .fob:hover { transform: rotate(-1.2deg); }
  .fob .string { position: absolute; top: -6px; left: 50%; width: 2px; height: 40px; margin-left: -1px; border-radius: 1px;
    background: linear-gradient(var(--gold-dark), #c9a46a); }
  .paper { position: relative; flex: 1; display: flex; flex-direction: column; background: var(--leather); color: #fff3d6; padding: 24px 12px 0;
    clip-path: polygon(22px 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%, 0 22px);
    background-image: linear-gradient(rgba(255,255,255,.12), rgba(255,255,255,0) 45%); }
  .paper::before { content: ""; position: absolute; inset: 5px; pointer-events: none; border: 1.5px dashed rgba(255,194,58,.6);
    clip-path: inherit; border-radius: 2px; }
  .window { background: var(--paper); color: var(--paper-ink); border-radius: 8px; padding: 7px; margin: 10px 0 10px;
    box-shadow: inset 0 0 0 3px rgba(120,10,15,.35), inset 0 2px 6px rgba(0,0,0,.18); }
  .paper .eyelet { position: absolute; top: 9px; left: 50%; width: 16px; height: 16px; margin-left: -8px; border-radius: 50%;
    background: var(--lobby); box-shadow: 0 0 0 4px var(--gold), 0 0 0 5px var(--gold-dark); }
  .tag-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 8px; padding-bottom: 7px;
    border-bottom: 1.5px solid rgba(255,194,58,.7); font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--gold); }
  .lockline { font-size: 10.5px; color: var(--red-dark); font-weight: 700; margin: 6px 2px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag-head .no { font-family: var(--mono); letter-spacing: .04em; color: rgba(255,243,214,.75); font-weight: 600; }
  .tag-head .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fob-name { font-family: var(--serif); font-size: 18px; font-weight: 700; color: #fff3d6; margin-top: 12px; line-height: 1.2;
    overflow-wrap: anywhere; }
  .fob-name.long { font-size: 15px; }
  .fob-desc { font-size: 12.5px; color: rgba(255,243,214,.92); margin-top: 3px; line-height: 1.4; min-height: 1.4em;
    display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
  .fob-ph { display: flex; align-items: center; gap: 8px; width: 100%; margin: 0; padding: 7px 8px; border-radius: 6px; font-weight: 600;
    border: 1.5px dashed var(--red); background: transparent; color: var(--red-dark); font-family: var(--mono); font-size: 12px; text-align: left; }
  .fob-ph span { flex: 1; overflow-wrap: anywhere; line-height: 1.35; font-size: 10.5px; }
  .fob-ph i { font-style: normal; font-family: -apple-system, sans-serif; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; opacity: .7; }
  .fob-ph:hover { background: rgba(215,38,46,.07); }
  .stub { position: relative; margin: auto -12px 0; padding: 6px 6px 8px; border-top: 2px dashed rgba(255,243,214,.35);
    display: flex; justify-content: space-between; background: rgba(0,0,0,.14); }
  .stub::before, .stub::after { content: ""; position: absolute; top: -9px; width: 16px; height: 16px; border-radius: 50%; background: var(--lobby); }
  .stub::before { left: -8px; } .stub::after { right: -8px; }
  .stub button { border: 0; background: transparent; color: #fff3d6; font-size: 11.5px; font-weight: 600; padding: 4px 8px; border-radius: 6px; }
  .stub button:hover { background: rgba(0,0,0,.15); color: var(--gold); }
  .stub button.out { color: rgba(255,243,214,.7); font-weight: 500; }
  @media (prefers-color-scheme: dark) { .fob { --paper: #f3e6c9; --paper-line: #d8c296; } }
  .empty { grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 28px 0 8px; }
  .empty svg { width: 96px; height: 96px; display: block; margin: 0 auto 10px; opacity: .9; }

  /* Check-in card (hotel registration card) */
  .checkin { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 22px 24px 20px;
    margin-bottom: 34px; box-shadow: 0 14px 30px -20px rgba(0,0,0,.35); position: relative; overflow: hidden; }
  .checkin::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 6px;
    background: repeating-linear-gradient(90deg, var(--red) 0 14px, var(--gold) 14px 28px); }
  .checkin h2 { margin-top: 4px; }
  .request { background: var(--cream); border-left: 4px solid var(--gold); border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; font-size: 14px; }
  .request a { color: var(--red); }
  form { display: grid; gap: 12px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 560px) { .two { grid-template-columns: 1fr; } }
  label { display: grid; gap: 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
  input[type=text], input[type=password] { font: inherit; font-size: 15px; letter-spacing: 0; text-transform: none; color: var(--ink);
    background: transparent; border: 0; border-bottom: 1.5px solid var(--line); border-radius: 0; padding: 7px 2px; width: 100%; }
  input:focus { outline: none; border-bottom-color: var(--red); }
  details.more summary { cursor: pointer; font-size: 13px; color: var(--muted); }
  .check { display: flex; gap: 8px; align-items: center; font-size: 14px; margin-top: 8px; color: var(--ink); text-transform: none; letter-spacing: 0; }
  .actions { display: flex; gap: 10px; align-items: center; margin-top: 4px; }
  .ghostbtn { border: 0; background: transparent; color: var(--muted); padding: 8px 10px; }
  .err { color: #c0362c; font-size: 13px; }

  /* Guest book and concierge */
  .book { margin-top: 36px; border-top: 1px solid var(--line); padding-top: 18px; }
  .book summary { cursor: pointer; font-family: var(--serif); font-size: 17px; list-style: none; }
  .book summary::-webkit-details-marker { display: none; }
  .book summary::before { content: "▸ "; color: var(--gold-dark); }
  .book[open] summary::before { content: "▾ "; }
  .entries { margin-top: 10px; font-size: 13.5px; }
  .entries div { padding: 6px 0; border-bottom: 1px dashed var(--line); display: flex; gap: 10px; }
  .entries .when { color: var(--muted); min-width: 64px; }
  .entries .stop { color: #c0362c; font-weight: 600; }
  pre { font-family: var(--mono); font-size: 12px; background: var(--card); border: 1px solid var(--line); border-radius: 8px;
    padding: 10px 12px; margin: 8px 0; white-space: pre-wrap; word-break: break-all; }
  .note { font-size: 13px; color: var(--muted); margin-top: 10px; }
  footer { margin-top: 40px; text-align: center; font-size: 12.5px; color: var(--muted); }

  .lobby-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .linkbtn { border: 1.5px solid var(--line); background: var(--card); color: var(--ink); border-radius: 999px; padding: 10px 16px; font-weight: 600; }
  .linkbtn:hover { border-color: var(--red); color: var(--red); }
  .imports { display: grid; gap: 0; margin: 4px 0 14px; }
  .imp { display: grid; grid-template-columns: 22px 1fr 1.1fr; gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px dashed var(--line); }
  .imp .k { font-family: var(--mono); font-size: 13px; word-break: break-all; }
  .imp .v { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .imp input[type=text] { font-size: 13px; padding: 4px 2px; }
  .imp.off { opacity: .5; }
  .imp input.nm { font-family: var(--mono); font-size: 13px; padding: 2px; }
  textarea#pasteBox { width: 100%; font-family: var(--mono); font-size: 13px; line-height: 1.5; color: var(--ink);
    background: var(--lobby); border: 1.5px solid var(--line); border-radius: 10px; padding: 12px; resize: vertical; margin-bottom: 8px; }
  textarea#pasteBox:focus { outline: none; border-color: var(--red); }
  html.app textarea { -webkit-user-select: text; user-select: text; }
  .tagline { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
  .dropzone { position: fixed; inset: 0; z-index: 40; display: none; align-items: center; justify-content: center;
    background: rgba(215,38,46,.88); color: #fff3d6; font-family: var(--serif); font-size: 28px; text-align: center; padding: 40px; }
  .dropzone.on { display: flex; }
  .dropzone div { border: 3px dashed #ffc23a; border-radius: 24px; padding: 48px 56px; }
  /* Rooms: one per client, plus your own suite */
  .room { margin: 0 0 34px; }
  .room-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .room-name { font-family: var(--serif); font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .room-name .door { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 26px; padding: 0 7px;
    border-radius: 6px; background: var(--red); color: var(--gold); font-size: 13px; font-family: var(--mono); font-weight: 700; }
  .room-name .door.own { background: var(--gold); color: var(--red-dark); }
  .room-count { color: var(--muted); font-size: 13px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: var(--card); border-radius: 999px;
    padding: 3px 6px 3px 10px; font-size: 12.5px; color: var(--ink); font-family: var(--mono); max-width: 320px; }
  .chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip button { border: 0; background: transparent; color: var(--muted); padding: 0 4px; font-size: 14px; line-height: 1; }
  .chip button:hover { color: var(--red); }
  .addfolder { border: 1px dashed var(--line); background: transparent; color: var(--muted); border-radius: 999px; padding: 3px 10px; font-size: 12.5px; }
  .addfolder:hover { color: var(--red); border-color: var(--red); }
  .folderform { display: none; gap: 6px; align-items: center; flex-basis: 100%; }
  .folderform.on { display: flex; }
  .folderform input { font-family: var(--mono); font-size: 13px; flex: 1; }
  .room-hint { flex-basis: 100%; font-size: 12.5px; color: var(--muted); }
  .combo { position: relative; display: flex; align-items: center; border-bottom: 1.5px solid var(--line); }
  .combo:focus-within { border-bottom-color: var(--red); }
  .combo input[type=text] { border: 0; flex: 1; padding-right: 34px; }
  .combo-btn { position: absolute; right: 0; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; border: 0; border-radius: 8px;
    background: transparent; color: var(--muted); font-size: 14px; }
  .combo-btn:hover { background: var(--cream); color: var(--red); }
  .combo-list { display: none; position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 25; background: var(--card);
    border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 14px 30px -12px rgba(0,0,0,.35); padding: 6px; max-height: 260px; overflow: auto; }
  .combo-list.on { display: block; }
  .combo-opt { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 9px 10px; border-radius: 8px;
    cursor: pointer; font-size: 14.5px; text-transform: none; letter-spacing: 0; color: var(--ink); }
  .combo-opt:hover, .combo-opt.hi { background: var(--cream); }
  .combo-opt small { color: var(--muted); font-size: 12px; }
  .combo-opt.new { color: var(--red); font-weight: 600; }
  .whoselabel { display: grid; gap: 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 12px; max-width: 420px; }
  select.whose { font: inherit; font-size: 15px; color: var(--ink); background: transparent; border: 0; border-bottom: 1.5px solid var(--line);
    padding: 7px 2px; width: 100%; text-transform: none; letter-spacing: 0; }
  select.whose:focus { outline: none; border-bottom-color: var(--red); }
  .whosebox { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  [hidden] { display: none !important; }
  .folderpath { font-family: var(--mono); font-size: 13.5px; background: var(--lobby); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; word-break: break-all; margin-bottom: 12px; }
  .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--ink); color: var(--lobby);
    padding: 9px 16px; border-radius: 999px; font-size: 14px; opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 30; }
  .toast.show { opacity: 1; }

  /* Native app window: the awning is the title bar */
  html.app .awning { -webkit-app-region: drag; }
  html.app { -webkit-user-select: none; user-select: none; }
  html.app input, html.app pre, html.app code { -webkit-user-select: text; user-select: text; }

</style>
</head>
<body>
<div class="awning"></div>
<main>
  <header class="lobby">
    <div class="brand"><!--ICON--><div><h1>Doorman</h1><p class="tag">He lets your AI in. Your keys never leave his pocket.</p></div></div>
    <div class="lobby-actions">
    <button class="linkbtn" id="importBtn" title="Paste keys from your notes, or import a .env file">Import keys</button>
    <input type="file" id="importFile" accept=".env,.txt,text/plain" hidden>
    <button class="bell" id="newBtn">
      <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><path d="M4 16a8 8 0 0 1 16 0z"/><rect x="2" y="17" width="20" height="2.5" rx="1.2"/></svg>
      Check in a key
    </button>
    </div>
  </header>

  <section class="checkin" id="pasteSheet" hidden>
    <h2>Import keys <small>From your notes, a password manager or a .env file</small></h2>
    <div class="request">Copy your whole note and paste it here, titles and all. Doorman finds the keys and uses each title as the name. Lines like <b>Stripe: sk_live_…</b> work, and so does a title with the key on the next line.</div>
    <textarea id="pasteBox" rows="9" spellcheck="false" autocomplete="off" placeholder="Stripe: sk_live_…&#10;OpenAI - sk-proj-…&#10;&#10;Supabase&#10;anon key: eyJ…"></textarea>
    <div class="err" id="pasteErr"></div>
    <div class="actions"><button class="bell" id="pasteGo">Find keys</button><button type="button" class="ghostbtn" id="pasteFile">Choose a .env file instead</button><button type="button" class="ghostbtn" id="pasteCancel">Cancel</button></div>
  </section>

  <section class="checkin" id="importSheet" hidden>
    <h2>Check in these keys <small id="importFrom"></small></h2>
    <div class="request">Doorman found these. Keys that look like credentials are ticked; check the names and where each one may be sent. Each key goes into your macOS Keychain.</div>
    <div class="whoselabel">Whose keys are these?<div class="combo" id="importWhose"></div></div>
    <div class="imp"><span></span><span class="tagline">Name on the tag</span><span class="tagline">Delivers only to</span></div>
    <div class="imports" id="importList"></div>
    <label class="check"><input type="checkbox" id="importCmds" checked> Allow these in commands, so <code>doorman run -- npm run dev</code> can use them</label>
    <div class="err" id="importErr"></div>
    <div class="actions"><button class="bell" id="importGo">Check in</button><button type="button" class="ghostbtn" id="importCancel">Cancel</button></div>
  </section>

  <section class="checkin" id="linkSheet" hidden>
    <h2>Link a project to a client <small>So your AI uses the right keys there</small></h2>
    <div class="request">Your AI wants to link this project folder. In this folder, <b>{{doorman:stripe}}</b> will mean the chosen client's Stripe key, and other clients' keys can't be used. Only confirm if it's right.</div>
    <div class="folderpath" id="linkFolder"></div>
    <div class="whoselabel">Whose project is this?<div class="combo" id="linkWhose"></div></div>
    <div class="err" id="linkErr"></div>
    <div class="actions"><button class="bell" id="linkGo">Confirm link</button><button type="button" class="ghostbtn" id="linkCancel">Not now</button></div>
  </section>

  <section class="checkin" id="addSheet" hidden>
    <h2>Check-in card <small>The key goes straight into your macOS Keychain</small></h2>
    <div class="request" id="hint" hidden></div>
    <form id="addForm" autocomplete="off">
      <div class="whoselabel">Whose key is this?<div class="combo" id="addWhose"></div></div>
      <div class="two">
        <label>Name on the tag <input type="text" name="name" placeholder="stripe" required pattern="[A-Za-z0-9_\-]{1,64}"></label>
        <label>Usually used with <input type="text" name="hosts" placeholder="api.stripe.com (optional)"></label>
      </div>
      <label>The key <input type="password" name="value" placeholder="Paste it here, never in the chat" required></label>
      <details class="more"><summary>More options</summary>
        <label style="margin-top:10px">Note <input type="text" name="description" placeholder="Stripe test-mode key"></label>
        <label style="margin-top:10px">Environment variable for doorman run <input type="text" name="envName" placeholder="STRIPE_SECRET_KEY" pattern="[A-Za-z_][A-Za-z0-9_]*"></label>
        <label class="check"><input type="checkbox" name="lockHosts"> Only ever send it to the hosts above</label>
        <label class="check"><input type="checkbox" name="allowCommands" checked> Can be used in commands and doorman run</label>
      </details>
      <div class="err" id="addErr"></div>
      <div class="actions"><button class="bell" type="submit">Check in</button><button type="button" class="ghostbtn" id="cancelBtn">Cancel</button></div>
    </form>
  </section>

  <section>
    <h2>Key rack <small id="count"></small></h2>
    <div id="list"></div>
  </section>

  <details class="book" id="bookBox">
    <summary>Guest book</summary>
    <div class="entries" id="log"></div>
  </details>

  <details class="book">
    <summary>Concierge: connect your AI</summary>
    <div class="note">Claude Code, run once in a terminal:</div>
    <pre id="cc"></pre>
    <div class="note">Cursor or Claude Desktop config:</div>
    <pre id="cj"></pre>
  </details>

  <footer>Doorman never shows your keys to your AI. He hands them over at the door, never in the chat.</footer>
</main>
<div class="toast" id="toast"></div>
<div class="dropzone" id="dropzone"><div>Drop your .env file<br><small style="font-size:17px">Doorman will check every key in</small></div></div>
<script>
  var initial = new URLSearchParams(location.search);
  var TOKEN = initial.get('t');
  history.replaceState(null, '', location.pathname + '?t=' + TOKEN);
  var $ = function (id) { return document.getElementById(id); };
  var BELLBOY = document.querySelector('.brand svg').outerHTML.replace(/hd-/g, 'eb-');

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-doorman-token': TOKEN, 'content-type': 'application/json' }, opts.headers || {});
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; });
    });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove('show'); }, 2400); }
  function ago(iso) {
    if (!iso) return 'never';
    var s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago';
  }

  var clearTimer;
  function copy(text, msg, sensitive) {
    navigator.clipboard.writeText(text).then(function () {
      toast(msg);
      if (sensitive) {
        clearTimeout(clearTimer);
        clearTimer = setTimeout(function () {
          navigator.clipboard.readText().then(function (cur) { if (cur === text) return navigator.clipboard.writeText(''); })
            .catch(function () { navigator.clipboard.writeText('').catch(function () {}); });
        }, 30000);
      }
    });
  }

  // ---- Rooms ------------------------------------------------------------------
  var ROOMS = [];
  function roomById(id) { for (var i = 0; i < ROOMS.length; i++) if (ROOMS[i].id === id) return ROOMS[i]; return null; }
  function roomLabel(id) { var r = roomById(id); return r ? r.label : id; }
  function friendly(id) { var i = String(id).indexOf('/'); return i < 0 ? id : id.slice(i + 1) + ' (' + roomLabel(id.slice(0, i)) + ')'; }
  function shortPath(f) { return f.replace(/^\/Users\/[^/]+/, '~'); }

  // "Whose keys?" field: type a client's name or pick one from the list.
  // "Mine" (or empty) means your own keys; a name that isn't listed becomes a new client.
  var MINE = /^(|mine|me|my own|own|my keys|your own keys|your suite|personal)$/i;
  function whoseField(root, prefer, onPick) {
    root.innerHTML = '';
    var input = document.createElement('input'); input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
    input.placeholder = 'Mine, or type a client';
    var btn = el('button', 'combo-btn', '▾'); btn.type = 'button'; btn.tabIndex = -1; btn.title = 'Show clients';
    var list = el('div', 'combo-list');
    root.appendChild(input); root.appendChild(btn); root.appendChild(list);
    var hi = -1, shown = [];
    function opts() {
      var o = [{ label: 'Mine', note: 'your own keys' }];
      ROOMS.forEach(function (r) { if (r.id !== 'own') o.push({ label: r.label, note: r.keys + (r.keys === 1 ? ' key' : ' keys') }); });
      return o;
    }
    function pick(label) { input.value = label; hide(); if (onPick) onPick(); }
    function show(filter) {
      var q = String(filter || '').trim().toLowerCase();
      list.innerHTML = ''; hi = -1;
      shown = opts().filter(function (o) { return !q || o.label.toLowerCase().indexOf(q) >= 0; });
      shown.forEach(function (o, i) {
        var it = el('div', 'combo-opt'); it.appendChild(el('span', '', o.label)); it.appendChild(el('small', '', o.note));
        it.onmousedown = function (e) { e.preventDefault(); pick(o.label); };
        list.appendChild(it);
      });
      var typed = String(filter || '').trim();
      if (typed && !MINE.test(typed) && !opts().some(function (o) { return o.label.toLowerCase() === typed.toLowerCase(); })) {
        var n = el('div', 'combo-opt new', '+ New client: ' + typed);
        n.onmousedown = function (e) { e.preventDefault(); pick(typed); };
        list.appendChild(n); shown.push({ label: typed });
      }
      list.classList.toggle('on', list.children.length > 0);
    }
    function hide() { list.classList.remove('on'); }
    function move(d) {
      var items = list.children; if (!items.length) return;
      if (hi >= 0) items[hi].classList.remove('hi');
      hi = (hi + d + items.length) % items.length; items[hi].classList.add('hi');
    }
    input.onfocus = function () { show(''); };
    input.oninput = function () { show(input.value); if (onPick) onPick(); };
    input.onblur = function () { hide(); };
    input.onkeydown = function (e) {
      if (!list.classList.contains('on')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(shown[hi].label); }
      else if (e.key === 'Escape') { hide(); }
    };
    btn.onmousedown = function (e) { e.preventDefault(); if (list.classList.contains('on')) hide(); else { input.focus(); show(''); } };
    var p = String(prefer || '').trim();
    input.value = MINE.test(p) ? 'Mine' : (ROOMS.filter(function (r) { return r.id !== 'own' && r.label.toLowerCase() === p.toLowerCase(); })[0] || { label: p }).label;
    return {
      // Room id for an existing client, 'own' for your keys, or the typed name for a new client.
      get: function () {
        var v = input.value.trim();
        if (MINE.test(v)) return 'own';
        var m = ROOMS.filter(function (r) { return r.id !== 'own' && r.label.toLowerCase() === v.toLowerCase(); })[0];
        return m ? m.id : v;
      },
      isNew: function () { var v = input.value.trim(); return !MINE.test(v) && !ROOMS.some(function (r) { return r.label.toLowerCase() === v.toLowerCase(); }); },
    };
  }

  var lastKeys = '';
  function fobFor(s, n) {
      var fob = el('div', 'fob');
      fob.appendChild(el('span', 'string'));
      var paper = el('div', 'paper'); fob.appendChild(paper);
      paper.appendChild(el('span', 'eyelet'));
      paper.appendChild(el('div', 'fob-name' + (s.name.length > 16 ? ' long' : ''), s.name.replace(/_/g, '_​')));
      var d = el('div', 'fob-desc', s.description || ''); d.title = s.description || ''; paper.appendChild(d);
      var ph = '{{doorman:' + s.name + '}}';
      var phb = el('button', 'fob-ph'); phb.title = 'Copy ' + ph;
      var phs = el('span'); phs.appendChild(document.createTextNode('{{doorman:')); phs.appendChild(document.createElement('wbr')); phs.appendChild(document.createTextNode(s.name + '}}')); phb.appendChild(phs); phb.appendChild(el('i', '', '⧉'));
      phb.onclick = function () { copy(ph, 'Copied ' + ph, false); };
      var win = el('div', 'window'); paper.appendChild(win);
      win.appendChild(phb);
      var envName = '$' + (s.envName || s.name.toUpperCase().replace(/-/g, '_'));
      fob.title = friendly(s.id) + '\n' + (s.lockHosts ? 'Only to ' + s.allowedHosts.join(', ') : 'Goes to: ' + (s.allowedHosts.length ? s.allowedHosts.join(', ') : 'anywhere needed')) +
        '\nIn code: ' + (s.allowCommands ? envName : 'commands off') + '\nUsed: ' + (s.lastUsedAt ? ago(s.lastUsedAt) : 'not yet');
      if (s.lockHosts) win.appendChild(el('div', 'lockline', '🔒 Only ' + s.allowedHosts.join(', ')));

      var stub = el('div', 'stub');
      var b1 = el('button', '', 'Copy key'); b1.onclick = function () {
        api('/api/secrets/' + encodeURIComponent(s.id) + '/reveal', { method: 'POST' })
          .then(function (j) { copy(j.value, 'Key copied. Clipboard clears in 30s.', true); }).catch(function (e) { toast(e.message); });
      };
      var b2 = el('button', 'out', 'Check out'); b2.onclick = function () {
        if (!confirm('Check out "' + friendly(s.id) + '"? It will be removed from Doorman and your Keychain.')) return;
        api('/api/secrets/' + encodeURIComponent(s.id), { method: 'DELETE' }).then(function () { toast(friendly(s.id) + ' checked out'); lastKeys = ''; load(); });
      };
      stub.appendChild(b1); stub.appendChild(b2); paper.appendChild(stub);
      return fob;
  }

  function render(secrets, rooms) {
    ROOMS = rooms || ROOMS;
    var sig = JSON.stringify([secrets, rooms]);
    if (sig === lastKeys) return; // don't redraw (and interrupt hovering) when nothing changed
    lastKeys = sig;
    var list = $('list'); list.innerHTML = '';
    $('count').textContent = secrets.length ? secrets.length + (secrets.length === 1 ? ' key' : ' keys') : '';
    if (!secrets.length && ROOMS.every(function (r) { return !r.folders.length; })) {
      var e = el('div', 'empty'); e.innerHTML = BELLBOY;
      e.appendChild(el('div', '', 'The rack is empty. Check in your first key, or let your AI ask for one.'));
      list.appendChild(e); return;
    }
    var door = 100;
    ROOMS.forEach(function (r) {
      var keys = secrets.filter(function (s) { return s.room === r.id; });
      if (!keys.length && !r.folders.length && r.id !== 'own') return;
      if (r.id === 'own' && !keys.length && !r.folders.length && secrets.length) return;
      var sec = el('div', 'room');
      var head = el('div', 'room-head');
      var nm = el('div', 'room-name');
      var badge = el('span', 'door' + (r.id === 'own' ? ' own' : ''), r.id === 'own' ? '★' : String(++door));
      nm.appendChild(badge); nm.appendChild(document.createTextNode(r.id === 'own' ? 'Your suite' : r.label));
      head.appendChild(nm);
      head.appendChild(el('span', 'room-count', keys.length + (keys.length === 1 ? ' key' : ' keys')));
      r.folders.forEach(function (f) {
        var c = el('span', 'chip'); c.title = f;
        c.appendChild(el('span', '', '📁 ' + shortPath(f)));
        var x = el('button', '', '×'); x.title = 'Unlink this folder';
        x.onclick = function () { api('/api/rooms/unlink', { method: 'POST', body: JSON.stringify({ folder: f }) }).then(function () { toast('Unlinked ' + shortPath(f)); lastKeys = ''; load(); }); };
        c.appendChild(x); head.appendChild(c);
      });
      var addf = el('button', 'addfolder', '+ Link a project folder');
      var ff = el('div', 'folderform');
      var fin = document.createElement('input'); fin.type = 'text'; fin.placeholder = '/Users/you/Projects/' + (r.id === 'own' ? 'my-app' : r.id + '-site');
      var fgo = el('button', 'linkbtn', 'Link'); fgo.style.padding = '6px 14px';
      fgo.onclick = function () {
        var v = fin.value.trim(); if (!v) return;
        api('/api/rooms/link', { method: 'POST', body: JSON.stringify({ room: r.id, folder: v }) })
          .then(function (j) { toast('Linked ' + shortPath(j.folder) + ' to ' + (r.id === 'own' ? 'your suite' : r.label)); lastKeys = ''; load(); })
          .catch(function (e2) { toast(e2.message); });
      };
      ff.appendChild(fin); ff.appendChild(fgo);
      addf.onclick = function () { ff.classList.toggle('on'); if (ff.classList.contains('on')) fin.focus(); };
      head.appendChild(addf); head.appendChild(ff);
      if (r.id !== 'own' && !r.folders.length) head.appendChild(el('div', 'room-hint', 'No project linked yet. Link one here, or your AI will ask you when it needs ' + r.label + "'s keys."));
      sec.appendChild(head);
      var rack = el('div', 'rack');
      keys.forEach(function (s, i) { rack.appendChild(fobFor(s, i + 1)); });
      if (keys.length) sec.appendChild(rack);
      list.appendChild(sec);
    });
  }

  function describe(e) {
    var names = (e.secrets || []).map(friendly).join(', ');
    if (e.tool === 'link_project') return { text: 'Linked ' + shortPath(e.folder || '') + ' to ' + (e.room === 'own' ? 'your suite' : roomLabel(e.room)) };
    if (e.tool === 'unlink_project') return { text: 'Unlinked ' + shortPath(e.folder || '') };
    if (e.tool === 'ui_copy') return { text: 'You copied ' + names };
    if (e.tool === 'ui_checkin') return { text: 'You checked in ' + names };
    if (e.tool === 'ui_checkout') return { text: 'You checked out ' + names };
    if (e.tool === 'ui_import') return { text: 'You checked in ' + e.secrets.length + ' keys for ' + (!e.room || e.room === 'own' ? 'your suite' : roomLabel(e.room)) };
    if (e.tool === 'doorman_run') return { text: 'A command ran with ' + (names || 'no keys') + ' (exit ' + e.exit + ')' };
    if (e.blocked) return { text: 'Stopped ' + names + ' at the door. ' + e.host + ' is not on the tag.', stop: true };
    if (e.tool === 'http_request') return { text: 'Let your AI through with ' + (names || 'no key') + ' to ' + e.host + (e.path || '') + (e.status ? ' (' + e.status + ')' : e.error ? ' (failed)' : '') };
    if (e.tool === 'run_command') return { text: 'Your AI ran a command with ' + (names || 'no key') + ' (exit ' + e.exit + ')' };
    return { text: e.tool + ' ' + names };
  }

  function load() {
    api('/api/secrets').then(function (j) { render(j.secrets, j.rooms); });
    api('/api/audit').then(function (j) {
      var log = $('log'); log.innerHTML = '';
      if (!j.entries.length) { log.appendChild(el('div', '', 'No visitors yet.')); return; }
      j.entries.slice(0, 15).forEach(function (e) {
        var d = describe(e); var row = el('div');
        row.appendChild(el('span', 'when', ago(e.at)));
        row.appendChild(el('span', d.stop ? 'stop' : '', d.text));
        log.appendChild(row);
      });
    });
  }

  var addWhose = null, importWhose = null, linkWhose = null;
  function openAdd(prefill) {
    $('addSheet').hidden = false;
    var f = $('addForm');
    addWhose = whoseField($('addWhose'), prefill && prefill.room);
    if (prefill) {
      f.name.value = prefill.add || ''; f.description.value = prefill.desc || ''; f.hosts.value = prefill.hosts || '';
      var h = $('hint'); h.hidden = false;
      h.textContent = 'Your AI is at the front desk asking for ' + (prefill.desc || ('"' + prefill.add + '"')) + '. Hand it over here, never in the chat.';
      if (prefill.hint) {
        h.appendChild(document.createTextNode(' Find it at '));
        if (/^https:\/\//.test(prefill.hint)) { var a = el('a', '', prefill.hint.replace(/^https:\/\//, '')); a.href = prefill.hint; a.target = '_blank'; a.rel = 'noopener'; h.appendChild(a); }
        else h.appendChild(document.createTextNode(prefill.hint));
      }
      f.value.focus();
    } else f.name.focus();
    $('addSheet').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function closeAdd() { $('addSheet').hidden = true; $('addForm').reset(); $('hint').hidden = true; $('addErr').textContent = ''; }

  $('newBtn').onclick = function () { openAdd(null); };
  $('cancelBtn').onclick = closeAdd;
  $('addForm').onsubmit = function (ev) {
    ev.preventDefault();
    var f = ev.target;
    var body;
    try { body = JSON.stringify({
      room: addWhose.get(),
      name: f.name.value.trim(), value: f.value.value, description: f.description.value.trim(), envName: f.envName.value.trim(),
      allowedHosts: f.hosts.value, allowCommands: f.allowCommands.checked, lockHosts: f.lockHosts.checked,
    }); } catch (e1) { $('addErr').textContent = e1.message; return; }
    api('/api/secrets', { method: 'POST', body: body }).then(function () { toast('Checked in. Doorman has it.'); closeAdd(); lastKeys = ''; load(); })
      .catch(function (e) { $('addErr').textContent = e.message; });
  };


  // ---- Import from .env -------------------------------------------------
  var importText = '';
  function startImport(text, fileName) {
    api('/api/import/preview', { method: 'POST', body: JSON.stringify({ text: text }) }).then(function (j) {
      if (!j.items.length) { $('pasteErr').textContent = 'No keys found. Try lines like "Stripe: sk_live_…".'; toast('No keys found.'); return; }
      importText = text;
      $('importFrom').textContent = fileName || '';
      importWhose = whoseField($('importWhose'), j.suggestedClient || '', refreshExists);
      setTimeout(refreshExists, 0);
      var list = $('importList'); list.innerHTML = '';
      j.items.forEach(function (it) {
        var row = el('div', 'imp' + (it.secret ? '' : ' off'));
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = it.secret && !it.empty; cb.disabled = it.empty;
        cb.onchange = function () { row.className = 'imp' + (cb.checked ? '' : ' off'); updateCount(); };
        var info = el('div');
        var nm = document.createElement('input'); nm.type = 'text'; nm.className = 'nm'; nm.value = it.name; nm.title = 'Name on the tag';
        info.appendChild(nm);
        var vline = el('div', 'v'); info.appendChild(vline);
        row._exists = function (ex) { vline.textContent = (it.empty ? '(empty)' : it.masked) + '  ·  $' + it.envName + (ex ? '  ·  replaces existing' : ''); };
        row._key = it.key;
        row._exists(false);
        var hosts = document.createElement('input'); hosts.type = 'text'; hosts.value = it.hosts.join(', '); hosts.placeholder = 'api.example.com';
        row.appendChild(cb); row.appendChild(info); row.appendChild(hosts);
        row._pick = function () { return cb.checked ? { key: it.key, name: nm.value.trim() || it.name, title: it.title, hosts: hosts.value, allowCommands: $('importCmds').checked } : null; };
        list.appendChild(row);
      });
      updateCount();
      closeAdd(); closePaste();
      $('importSheet').hidden = false;
      $('importSheet').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }).catch(function (e) { toast(e.message); });
  }
  // Which keys would replace one already checked in for the chosen client?
  function refreshExists() {
    var rows = Array.prototype.slice.call($('importList').children);
    if (!importWhose || importWhose.isNew()) { rows.forEach(function (r) { r._exists(false); }); return; }
    api('/api/import/preview', { method: 'POST', body: JSON.stringify({ text: importText, room: importWhose.get() }) }).then(function (j) {
      var ex = {}; j.items.forEach(function (it) { ex[it.key] = it.exists; });
      rows.forEach(function (r) { r._exists(!!ex[r._key]); });
    });
  }
  function picks() { return Array.prototype.map.call($('importList').children, function (r) { return r._pick(); }).filter(Boolean); }
  function updateCount() { var n = picks().length; $('importGo').textContent = n ? 'Check in ' + n + (n === 1 ? ' key' : ' keys') : 'Nothing selected'; $('importGo').disabled = !n; }
  function closeImport() { $('importSheet').hidden = true; $('importList').innerHTML = ''; importText = ''; $('importErr').textContent = ''; }
  function readFile(file) {
    if (!file) return;
    if (file.size > 900000) { toast('That file is too large to be a .env file.'); return; }
    var r = new FileReader(); r.onload = function () { startImport(String(r.result), file.name); }; r.readAsText(file);
  }
  function openPaste() { closeAdd(); closeImport(); $('pasteSheet').hidden = false; $('pasteBox').focus(); $('pasteSheet').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  function closePaste() { $('pasteSheet').hidden = true; $('pasteBox').value = ''; $('pasteErr').textContent = ''; }
  $('importBtn').onclick = openPaste;
  $('pasteCancel').onclick = closePaste;
  $('pasteFile').onclick = function () { $('importFile').value = ''; $('importFile').click(); };
  $('pasteGo').onclick = function () {
    var t = $('pasteBox').value;
    if (!t.trim()) { $('pasteErr').textContent = 'Paste your note first.'; return; }
    startImport(t, 'from your note');
  };
  $('importFile').onchange = function () { readFile(this.files[0]); };
  $('importCancel').onclick = closeImport;
  $('importGo').onclick = function () {
    var room = importWhose.get();
    api('/api/import', { method: 'POST', body: JSON.stringify({ text: importText, picks: picks(), room: room }) })
      .then(function (j) { toast('Checked in ' + j.saved.length + (j.saved.length === 1 ? ' key' : ' keys') + '. Doorman has them.'); closeImport(); lastKeys = ''; load(); })
      .catch(function (e) { $('importErr').textContent = e.message; });
  };
  // Drag a .env file anywhere onto the window.
  var dragDepth = 0;
  document.addEventListener('dragenter', function (e) { e.preventDefault(); dragDepth++; $('dropzone').classList.add('on'); });
  document.addEventListener('dragleave', function (e) { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; $('dropzone').classList.remove('on'); } });
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    e.preventDefault(); dragDepth = 0; $('dropzone').classList.remove('on');
    readFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  // ---- Link a project folder to a client (asked for by the AI) -----------------
  var linkFolderPath = '';
  function openLink(folder, client) {
    linkFolderPath = folder;
    $('linkFolder').textContent = folder;
    linkWhose = whoseField($('linkWhose'), client);
    $('linkSheet').hidden = false;
    $('linkSheet').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  $('linkCancel').onclick = function () { $('linkSheet').hidden = true; };
  $('linkGo').onclick = function () {
    var room = linkWhose.get();
    api('/api/rooms/link', { method: 'POST', body: JSON.stringify({ room: room, folder: linkFolderPath }) })
      .then(function (j) { toast('Linked to ' + (j.room === 'own' ? 'your suite' : j.label) + '. Your AI can carry on.'); $('linkSheet').hidden = true; lastKeys = ''; load(); })
      .catch(function (e) { $('linkErr').textContent = e.message; });
  };

  var params = {}; ['add', 'desc', 'hosts', 'hint', 'room'].forEach(function (k) { params[k] = initial.get(k); });
  var startup = api('/api/secrets').then(function (j) { render(j.secrets, j.rooms); });
  if (params.add) startup.then(function () { openAdd(params); });
  else if (initial.get('link')) startup.then(function () { openLink(initial.get('link'), initial.get('client') || ''); });
  else if (initial.get('new')) startup.then(function () { openAdd(null); });
  if (initial.get('app')) document.documentElement.classList.add('app');

  api('/api/setup').then(function (j) { $('cc').textContent = j.claudeCode; $('cj').textContent = j.cursorJson; });
  load();
  setInterval(load, 5000);
</script>
</body>
</html>`;

export const PAGE = RAW.replace('<!--ICON-->', appIconSvg(64).replace(/dm-/g, 'hd-'));
