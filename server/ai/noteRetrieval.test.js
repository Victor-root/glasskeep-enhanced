// server/ai/noteRetrieval.test.js
// Run with: node server/ai/noteRetrieval.test.js
//
// No test framework — assertions are plain Node + a tiny `eq()` helper.
// Each scenario logs PASS/FAIL and the script exits non-zero on first
// failure so CI (or `npm test` if ever wired) catches regressions.
"use strict";

const r = require("./noteRetrieval");

let failures = 0;

function eq(label, actual, expected) {
  const aStr = JSON.stringify(actual);
  const eStr = JSON.stringify(expected);
  if (aStr === eStr) {
    console.log(`PASS  ${label}`);
  } else {
    failures++;
    console.log(`FAIL  ${label}`);
    console.log(`      expected: ${eStr}`);
    console.log(`      actual:   ${aStr}`);
  }
}

function assert(label, cond) {
  if (cond) console.log(`PASS  ${label}`);
  else {
    failures++;
    console.log(`FAIL  ${label}`);
  }
}

// ── Sample corpus ─────────────────────────────────────────────────────
const corpus = [
  {
    id: "1",
    title: "Wallet Bitcoin",
    content:
      "Adresse BTC: 1Abc...\nMon portefeuille principal pour le bitcoin.\nseed phrase: stockée sur clé USB chiffrée.",
    tags: ["crypto", "bitcoin"],
  },
  {
    id: "2",
    title: "Wallet Ethereum",
    content:
      "Adresse ETH: 0x...\nMetamask connecté.\nMnemonique de récupération: dans le coffre.",
    tags: ["crypto", "ethereum"],
  },
  {
    id: "3",
    title: "Liste de courses",
    content: "pain\nlait\noeufs\nfromage",
    tags: [],
  },
  {
    id: "4",
    title: "Wireguard VPN",
    content:
      "Configuration VPN avec wireguard.\nAdresse du serveur: vpn.example.com\nClé privée stockée dans /etc/wireguard.",
    tags: ["reseau", "vpn"],
  },
  {
    id: "5",
    title: "Crypto news",
    content: "Article sur les cryptomonnaies en 2025.",
    tags: ["crypto"],
  },
  {
    id: "6",
    title: "Mots de passe Gmail",
    content: "identifiant: alice@gmail.com\nmot de passe stocké dans bitwarden.",
    tags: ["password", "google"],
  },
];

// ── Variant tests ─────────────────────────────────────────────────────
console.log("\n[plural variants]");
const { expandPluralVariants, expandToken, normalize, tokenize } = r.__internals;
eq("wallets → wallet", [...expandPluralVariants("wallets")].sort(), ["wallet", "wallets"]);
eq("cryptos → crypto", [...expandPluralVariants("cryptos")].sort(), ["crypto", "cryptos"]);
eq("entries → entry", [...expandPluralVariants("entries")].sort(), ["entries", "entry"]);
eq("notes → note", [...expandPluralVariants("notes")].sort(), ["note", "notes"]);
eq("ssl unchanged", [...expandPluralVariants("ssl")], ["ssl"]);
eq("ss unchanged (no -s strip)", [...expandPluralVariants("class")], ["class"]);

console.log("\n[synonym expansion]");
assert("wallet expands with portefeuille", expandToken("wallet").has("portefeuille"));
assert("crypto expands with cryptomonnaie", expandToken("crypto").has("cryptomonnaie"));
assert("seed expands with mnemonic", expandToken("seed").has("mnemonic"));
assert("portefeuilles expands with wallet", expandToken("portefeuilles").has("wallet"));

// ── List-intent tests ─────────────────────────────────────────────────
console.log("\n[list intent]");
assert("'find my crypto'", r.detectListIntent("find my crypto wallets"));
assert("'show notes about'", r.detectListIntent("show notes about docker"));
assert("'cherche mes notes'", r.detectListIntent("cherche mes notes crypto"));
assert("'trouve mon wallet'", r.detectListIntent("trouve mon wallet"));
assert("'comment marche le X' is NOT list", !r.detectListIntent("comment marche le wallet"));

// ── Retrieval scenarios ───────────────────────────────────────────────
console.log("\n[retrieval — main case]");
{
  const picked = r.pickRelevantNotes(corpus, "je cherche mes wallets crypto");
  const ids = picked.map((p) => p.note.id);
  console.log("  picked:", ids);
  assert("wallets crypto → returns notes", picked.length > 0);
  assert("wallets crypto → includes #1 (Wallet Bitcoin)", ids.includes("1"));
  assert("wallets crypto → includes #2 (Wallet Ethereum)", ids.includes("2"));
  assert("wallets crypto → does NOT include #3 (Liste courses)", !ids.includes("3"));
  // Wallet Bitcoin and Wallet Ethereum (match wallet+crypto) should
  // outrank Crypto news (matches only crypto).
  const idx1 = ids.indexOf("1");
  const idx5 = ids.indexOf("5");
  assert("wallets+crypto notes outrank crypto-only", idx1 !== -1 && (idx5 === -1 || idx1 < idx5));
}

console.log("\n[retrieval — singular variant]");
{
  const picked = r.pickRelevantNotes(corpus, "je cherche mon wallet crypto");
  const ids = picked.map((p) => p.note.id);
  console.log("  picked:", ids);
  assert("wallet crypto → includes #1 and #2", ids.includes("1") && ids.includes("2"));
}

console.log("\n[retrieval — synonym FR → EN]");
{
  const picked = r.pickRelevantNotes(corpus, "trouve mon portefeuille bitcoin");
  const ids = picked.map((p) => p.note.id);
  console.log("  picked:", ids);
  assert("portefeuille bitcoin → finds #1", ids.includes("1"));
}

console.log("\n[retrieval — tag-only match]");
{
  const picked = r.pickRelevantNotes(corpus, "crypto");
  const ids = picked.map((p) => p.note.id);
  console.log("  picked:", ids);
  assert("crypto → finds tagged notes", ids.includes("1") && ids.includes("2") && ids.includes("5"));
}

console.log("\n[retrieval — password / mot de passe synonym]");
{
  const picked = r.pickRelevantNotes(corpus, "où est mon password gmail");
  const ids = picked.map((p) => p.note.id);
  console.log("  picked:", ids);
  assert("password gmail → finds #6", ids.includes("6"));
}

console.log("\n[retrieval — no relevant note]");
{
  const picked = r.pickRelevantNotes(corpus, "pizza recipe");
  console.log("  picked:", picked.map((p) => p.note.id));
  eq("no match → []", picked, []);
}

console.log("\n[retrieval — pure stopwords]");
{
  const picked = r.pickRelevantNotes(corpus, "que faire");
  console.log("  picked:", picked.map((p) => p.note.id));
  eq("pure stopwords → []", picked, []);
}

console.log("\n[retrieval — empty corpus]");
{
  eq("empty notes → []", r.pickRelevantNotes([], "wallet"), []);
}

console.log("\n[snippet extraction — compact]");
{
  const picked = r.pickRelevantNotes(corpus, "wallet seed phrase");
  const note1 = picked.find((p) => p.note.id === "1");
  console.log("  #1 snippet:", note1?.snippet);
  assert("snippet includes 'seed'", note1 && /seed/i.test(note1.snippet));
  assert("compact picks short snippets", note1.snippet.length < 800);
}

console.log("\n[snippet extraction — inventory short note]");
{
  // Inventory mode must send the note's full content when it fits in
  // the per-note budget (8 KB). No block-based extraction, no ellipses.
  const inventoryCorpus = [
    {
      id: "10",
      title: "Mes wallets crypto",
      tags: ["crypto"],
      content: [
        "Bitcoin wallet",
        "  adresse: bc1qxy2k...",
        "  label: cold storage",
        "  unrelated extra line that doesn't mention the keyword",
        "",
        "Ethereum wallet",
        "  adresse: 0xAbC123...",
        "  label: metamask quotidien",
        "",
        "Monero wallet",
        "  adresse publique: 4Ad...",
        "  hauteur de bloc: 3 050 412",
        "  vue: privé",
        "",
        "Solana wallet",
        "  adresse: SoLA1...",
        "  label: phantom",
        "",
        "Random note with no wallet mention at all but still in the file.",
      ].join("\n"),
    },
  ];
  const inv = r.pickRelevantNotes(
    inventoryCorpus,
    "liste mes wallets crypto",
    { mode: "inventory" },
  );
  const cmp = r.pickRelevantNotes(
    inventoryCorpus,
    "liste mes wallets crypto",
    { mode: "compact" },
  );
  console.log("  inventory length:", inv[0].snippet.length);
  console.log("  compact   length:", cmp[0].snippet.length);

  assert("inventory > compact", inv[0].snippet.length > cmp[0].snippet.length);
  assert("inventory keeps Bitcoin", /Bitcoin/.test(inv[0].snippet));
  assert("inventory keeps Ethereum", /Ethereum/.test(inv[0].snippet));
  assert("inventory keeps Monero", /Monero/.test(inv[0].snippet));
  assert("inventory keeps Solana", /Solana/.test(inv[0].snippet));
  assert(
    "inventory keeps hauteur de bloc",
    /hauteur de bloc/.test(inv[0].snippet),
  );
  assert(
    "inventory keeps adresse publique",
    /adresse publique/.test(inv[0].snippet),
  );
  // Full content includes the unrelated random line and the orphan
  // line at the bottom — proves no snippet/block filtering happened.
  assert(
    "inventory keeps unrelated extra line",
    /unrelated extra line/.test(inv[0].snippet),
  );
  assert(
    "inventory keeps trailing orphan paragraph",
    /Random note with no wallet/.test(inv[0].snippet),
  );
  assert("inventory has no truncation marker", !inv[0].snippet.endsWith("…"));
  // Compact still picks only top-3 matched lines, so it can't see all 4 wallets.
  const compactWalletCount = (cmp[0].snippet.match(/wallet/g) || []).length;
  assert("compact drops some entries", compactWalletCount < 4);
}

console.log("\n[snippet extraction — inventory truncation fallback]");
{
  // Build a note longer than the 8 KB per-note budget. The block-based
  // fallback must keep the matched paragraphs and drop the surrounding
  // padding rather than slicing the middle of an entry.
  const padBlock = "Lorem ipsum padding text. ".repeat(40); // ~1 KB
  const blocks = [];
  for (let i = 0; i < 12; i++) {
    blocks.push(padBlock);                      // unrelated padding
    blocks.push(`wallet entry #${i}\n  address: addr-${i}\n  label: lbl-${i}`);
  }
  const longCorpus = [{
    id: "11",
    title: "Huge wallet log",
    tags: ["wallet"],
    content: blocks.join("\n\n"),
  }];
  const inv = r.pickRelevantNotes(longCorpus, "wallet", { mode: "inventory" });
  console.log("  raw content length:", longCorpus[0].content.length);
  console.log("  inventory snippet length:", inv[0].snippet.length);
  assert("oversized note is truncated under 8.1 KB", inv[0].snippet.length <= 8200);
  // Block-based fallback should keep the matched wallet entries and
  // drop the unrelated padding blocks.
  assert(
    "fallback keeps wallet entry #0",
    /wallet entry #0/.test(inv[0].snippet),
  );
  assert(
    "fallback drops Lorem padding",
    !/Lorem ipsum/.test(inv[0].snippet),
  );
}

console.log("\n[context block format — compact]");
{
  const picked = r.pickRelevantNotes(corpus, "wallet bitcoin");
  const block = r.buildContextBlock(picked[0]);
  console.log("  block:\n" + block);
  assert("block has [id] prefix", /^\[1\]/.test(block));
  assert("block has TITLE:", /TITLE:/.test(block));
  assert("block has TAGS:", /TAGS:/.test(block));
  assert("block has MATCHED:", /MATCHED:/.test(block));
  assert("compact uses SNIPPET:", /SNIPPET:/.test(block));
}

console.log("\n[context block format — inventory]");
{
  const picked = r.pickRelevantNotes(corpus, "wallet bitcoin", {
    mode: "inventory",
  });
  const block = r.buildContextBlock(picked[0], { mode: "inventory" });
  console.log("  block:\n" + block);
  assert("inventory uses CONTENT:", /CONTENT:/.test(block));
}

console.log("\n────────────────────────────");
if (failures === 0) {
  console.log("All retrieval tests passed.");
  process.exit(0);
} else {
  console.log(`${failures} failure(s).`);
  process.exit(1);
}
