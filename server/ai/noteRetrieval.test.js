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
const {
  expandPluralVariants, expandToken, WEAK_TOKENS,
} = r.__internals;
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

// ── WEAK_TOKENS classification ────────────────────────────────────────
console.log("\n[weak token classification]");
assert("config is weak", WEAK_TOKENS.has("config"));
assert("configuration is weak", WEAK_TOKENS.has("configuration"));
assert("tuto is weak", WEAK_TOKENS.has("tuto"));
assert("installation is weak", WEAK_TOKENS.has("installation"));
assert("setup is weak", WEAK_TOKENS.has("setup"));
assert("doc is weak", WEAK_TOKENS.has("doc"));
assert("jellyfin is NOT weak", !WEAK_TOKENS.has("jellyfin"));
assert("docker is NOT weak", !WEAK_TOKENS.has("docker"));
assert("kill is NOT weak", !WEAK_TOKENS.has("kill"));
assert("vm is NOT weak", !WEAK_TOKENS.has("vm"));
assert("crypto is NOT weak", !WEAK_TOKENS.has("crypto"));

// ── Anchor gate: weak-only notes are dropped ──────────────────────────
console.log("\n[anchor gate — config jellyfin]");
{
  const jellyCorp = [
    {
      id: "300",
      title: "Jellyfin vroot",
      tags: ["jellyfin", "media"],
      content: "config jellyfin dans vroot",
    },
    {
      id: "301",
      title: "STORJ NODES CONFIG",
      tags: ["storj", "stockage"],
      content: "configuration des noeuds storj",
    },
    {
      id: "302",
      title: "Installation Nextcloud",
      tags: ["nextcloud"],
      content: "installation et configuration de nextcloud",
    },
    {
      id: "303",
      title: "Linux bond config",
      tags: ["reseau"],
      content: "configuration d un bond reseau linux",
    },
  ];
  const picked = r.pickRelevantNotes(jellyCorp, "je cherche une config jellyfin");
  const ids = picked.map((p) => p.note.id);
  console.log("  picked:", ids);
  assert("config jellyfin keeps Jellyfin vroot", ids.includes("300"));
  assert("config jellyfin drops STORJ CONFIG (config only)", !ids.includes("301"));
  assert("config jellyfin drops Nextcloud (config only)", !ids.includes("302"));
  assert("config jellyfin drops Linux bond (config only)", !ids.includes("303"));
  // Verify reason in dropped via metricsOut
  const metrics = {};
  r.pickRelevantNotes(jellyCorp, "je cherche une config jellyfin", {
    metricsOut: metrics,
  });
  assert(
    "anchorTokens contains jellyfin",
    Array.isArray(metrics.anchorTokens) && metrics.anchorTokens.includes("jellyfin"),
  );
  assert(
    "weakTokens contains config",
    Array.isArray(metrics.weakQueryTokens) && metrics.weakQueryTokens.includes("config"),
  );
  // Phase 1.5 (rare-anchor-miss) drops these before Phase 1 (weak-only-match)
  // can reach them, so either reason is valid.
  const droppedWithoutAnchor = metrics.dropped.filter(
    (d) =>
      d.reason === "weak-only-match" || d.reason === "rare-anchor-miss",
  );
  assert(
    "notes without jellyfin dropped (weak-only-match or rare-anchor-miss)",
    droppedWithoutAnchor.length >= 1,
  );
}

// ── Anchor gate: only-weak query falls back to score-ratio ────────────
console.log("\n[anchor gate — config only (no anchor)]");
{
  // If ALL tokens are weak, hasAnchors=false and we fall back to
  // score-ratio pruning — we don't return [].
  const weakCorp = [
    {
      id: "400",
      title: "Configuration guide",
      tags: [],
      content: "guide de configuration generale",
    },
    {
      id: "401",
      title: "Random note",
      tags: [],
      content: "rien a voir",
    },
  ];
  const picked = r.pickRelevantNotes(weakCorp, "config guide");
  const ids = picked.map((p) => p.note.id);
  assert("all-weak query still returns matching note", ids.includes("400"));
  assert("all-weak query doesn't return unmatched note", !ids.includes("401"));
}

// ── Short-token exact-match (no `vm` inside `lvm`) ───────────────────
console.log("\n[short-token exact match]");
{
  const corpus2 = [
    {
      id: "100",
      title: "Kill VM",
      tags: ["proxmox"],
      content: "rm /var/lock/qemu-server/lock-101.conf",
    },
    {
      id: "101",
      title: "Cloner partition vers local-lvm",
      tags: ["proxmox", "stockage"],
      content: "dd if=/dev/sda of=/dev/lvm/blah",
    },
    {
      id: "102",
      title: "Creer un RAID1 avec mdadm",
      tags: ["raid"],
      content: "mdadm --create /dev/md0 --level=1 ...",
    },
  ];
  const picked = r.pickRelevantNotes(corpus2, "je cherche a kill une vm");
  const ids = picked.map((p) => p.note.id);
  console.log("  picked:", ids);
  assert("kill vm finds Kill VM", ids.includes("100"));
  assert("kill vm does NOT match local-lvm via substring", !ids.includes("101"));
  assert("kill vm drops unrelated RAID note", !ids.includes("102"));
}

// ── Pruning: top dominates -> only top kept ──────────────────────────
console.log("\n[pruning — obvious top]");
{
  const metrics = {};
  const corpus3 = [
    {
      id: "200",
      title: "Kill VM",
      tags: ["proxmox"],
      content: "rm /var/lock/qemu-server/lock-101.conf",
    },
    {
      id: "201",
      title: "Notes diverses proxmox",
      tags: ["proxmox"],
      content: "tu peux kill un process avec kill -9 PID.",
    },
    {
      id: "202",
      title: "Random",
      tags: [],
      content: "rien a voir avec la requete.",
    },
  ];
  const picked = r.pickRelevantNotes(corpus3, "je cherche a kill une vm", {
    metricsOut: metrics,
  });
  const ids = picked.map((p) => p.note.id);
  console.log("  picked:", ids);
  console.log("  metrics:", metrics);
  assert(
    "only Kill VM survives pruning",
    ids.length === 1 && ids[0] === "200",
  );
  assert(
    "metrics report beforePruningCount > afterPruningCount",
    metrics.beforePruningCount > metrics.afterPruningCount,
  );
  assert("metrics flag topIsObvious", metrics.topIsObvious === true);
  assert(
    "dropped notes carry reason",
    Array.isArray(metrics.dropped) &&
      metrics.dropped.length > 0 &&
      typeof metrics.dropped[0].reason === "string" &&
      metrics.dropped[0].reason.length > 0,
  );
}

// ── Pruning preserves broad multi-note inventory queries ─────────────
console.log("\n[pruning — broad inventory query]");
{
  const picked = r.pickRelevantNotes(corpus, "je cherche mes wallets crypto", {
    mode: "inventory",
  });
  const ids = picked.map((p) => p.note.id);
  console.log("  picked:", ids);
  assert("inventory keeps Wallet Bitcoin", ids.includes("1"));
  assert("inventory keeps Wallet Ethereum", ids.includes("2"));
  assert("inventory drops Liste de courses", !ids.includes("3"));
}

// ── Stopwords: "je", "comment", "veux"… should be filtered ───────────
console.log("\n[extended stopwords]");
{
  eq(
    "'je veux comment faire' -> []",
    r.pickRelevantNotes(corpus, "je veux comment faire"),
    [],
  );
  const picked = r.pickRelevantNotes(
    corpus,
    "je veux comment trouver mon wallet",
  );
  const ids = picked.map((p) => p.note.id);
  assert(
    "'... wallet' still finds wallets",
    ids.includes("1") || ids.includes("2"),
  );
}

// ── Rare-anchor soft fallback: multi-anchor match rescues note ───────
// A note that misses the rarest anchor should survive if it already
// matches ≥2 other anchor tokens (e.g. "clé github" note for query
// "clé api github" where "api" is the rarest anchor).
console.log("\n[rare-anchor soft fallback — clé api github]");
{
  // Build a corpus where "api" appears in only 1 note (→ highest IDF,
  // becomes rareAnchorToken), while "cle" and "github" each appear in
  // 2 notes (→ lower IDF). Note 700 matches cle+github but NOT api.
  const apiCorpus = [
    {
      id: "700",
      title: "Clé pour github access token (classic)",
      tags: ["github", "token"],
      content: "Personal access token GitHub classic.",
    },
    {
      id: "701",
      title: "Config API serveur",
      tags: ["api", "backend"],
      content: "Configuration de l'API backend.",
    },
    // Extra notes to lower cle/github IDF, making api clearly the rarest.
    {
      id: "702",
      title: "Clé SSH accès serveur",
      tags: ["ssh"],
      content: "Clé privée SSH pour connexion.",
    },
    {
      id: "703",
      title: "GitHub Actions workflow",
      tags: ["github", "ci"],
      content: "Pipeline CI avec GitHub Actions.",
    },
  ];
  const metrics = {};
  const picked = r.pickRelevantNotes(apiCorpus, "clé api github", { metricsOut: metrics });
  const ids = picked.map((p) => p.note.id);
  console.log("  clé api github picked:", ids);
  console.log("  rareAnchorTokens:", metrics.rareAnchorTokens);
  assert("api is rarest anchor in this corpus", metrics.rareAnchorTokens.includes("api"));
  assert("clé api github finds GitHub token note", ids.includes("700"));

  // The kept-but-penalized note should carry the rareAnchorPenalty flag.
  const kept700 = picked.find((p) => p.note.id === "700");
  assert("note 700 carries rareAnchorPenalty flag", kept700?.rareAnchorPenalty === true);

  // "clé github" (no api) must also find note 700 normally.
  const pickedBase = r.pickRelevantNotes(apiCorpus, "clé github");
  assert("clé github finds GitHub token note", pickedBase.some((p) => p.note.id === "700"));

  // A config-only note (701 matches "api" only, 702/703 match one anchor
  // but not the rare one "api") — Phase 2 should eliminate them all.
  assert("only note 700 survives for clé api github", ids[0] === "700");
}

// ── Ranking: title multi-anchor beats body repetition ────────────────
// Regression for "Utiliser xterm.js sur une VM" outranking "Kill VM"
// for the query "kill une vm proxmox" when body hits were uncapped.
console.log("\n[ranking — Kill VM over xterm.js via rare-anchor pruning]");
{
  const rankCorpus = [
    {
      id: "500",
      title: "Kill VM",
      tags: ["proxmox"],
      content: "qm stop 101\npveam update",
    },
    {
      id: "501",
      title: "Utiliser xterm.js sur une VM",
      tags: ["proxmox", "terminal"],
      content:
        "xterm.js est un terminal web. " +
        "Installation sur une VM proxmox. " +
        "La VM doit avoir nodejs. " +
        "Lancer dans la VM avec node index.js. " +
        "La VM ecoutera sur le port 3000.",
    },
  ];
  const metrics = {};
  const picked = r.pickRelevantNotes(
    rankCorpus,
    "je cherche a kill une vm proxmox",
    { metricsOut: metrics },
  );
  const ids = picked.map((p) => p.note.id);
  console.log("  picked:", ids, "scores:", picked.map((p) => p.score.toFixed(3)));
  assert("rareAnchorTokens populated in metrics", Array.isArray(metrics.rareAnchorTokens) && metrics.rareAnchorTokens.length > 0);
  assert("Kill VM is in results", ids.includes("500"));
  assert("Kill VM ranks first", ids[0] === "500");
  // xterm.js survives Phase 1.5 via strong fallback (vm+proxmox anchor match)
  // but is still dropped by Phase 2 score-ratio because Kill VM dominates.
  assert("xterm.js not in final results (dominated by Kill VM)", !ids.includes("501"));
  assert("Kill VM anchorCoverage = 1", picked[0]?.anchorCoverage === 1);
}

// ── anchorCoverage exposed on picked notes ────────────────────────────
console.log("\n[anchorCoverage — partial vs full coverage]");
{
  const covCorpus = [
    {
      id: "600",
      title: "Kill VM",
      tags: ["proxmox"],
      content: "qm stop 101",
    },
    {
      id: "601",
      title: "Autre note proxmox",
      tags: ["proxmox"],
      content: "gestion des vms proxmox",
    },
  ];
  // "kill vm proxmox": 3 anchors. Kill VM matches all 3 (title: kill+vm, tag: proxmox).
  // "601" matches proxmox only (1/3). rareAnchorTokens=[kill or vm]; 601 doesn't
  // match kill or vm → pruned by Phase 1.5.
  const picked = r.pickRelevantNotes(covCorpus, "kill une vm proxmox");
  const killNote = picked.find((p) => p.note.id === "600");
  console.log("  Kill VM anchorCoverage:", killNote?.anchorCoverage, "matchedAnchorCount:", killNote?.matchedAnchorCount);
  assert("Kill VM found", killNote != null);
  assert("Kill VM anchorCoverage = 1", killNote?.anchorCoverage === 1);
  assert("Kill VM matchedAnchorCount = 3", killNote?.matchedAnchorCount === 3);
  assert("Autre note pruned by rare-anchor-miss", !picked.find((p) => p.note.id === "601"));
}

// ── rareAnchorTokens in metricsOut ───────────────────────────────────
console.log("\n[metricsOut — rareAnchorTokens]");
{
  const metrics = {};
  r.pickRelevantNotes(corpus, "wallet bitcoin", { metricsOut: metrics });
  // "bitcoin" has lower df than "wallet" (only Wallet Bitcoin has it) → rarest
  assert("rareAnchorTokens in metrics", Array.isArray(metrics.rareAnchorTokens));
  assert("bitcoin is rarest anchor for 'wallet bitcoin'", metrics.rareAnchorTokens.includes("bitcoin"));
}

console.log("\n────────────────────────────");
if (failures === 0) {
  console.log("All retrieval tests passed.");
  process.exit(0);
} else {
  console.log(`${failures} failure(s).`);
  process.exit(1);
}
