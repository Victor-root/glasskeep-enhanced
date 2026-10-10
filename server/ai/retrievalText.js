// server/ai/retrievalText.js
// The vocabulary and text matching the AI note retrieval (noteRetrieval.js)
// is built on: stop-words, weak tokens, synonyms, normalisation, the
// plural/synonym expansion of a query token, and how one variant is
// matched inside a note field.
"use strict";

// ── Stop-words ─────────────────────────────────────────────────────────
// Words too generic to carry meaning. Kept tight on purpose so domain
// terms (project names, "rustdesk", "wireguard", …) survive.
const STOP_WORDS = new Set([
  // English
  "the","is","are","was","were","be","been","being","of","and","or","not",
  "to","in","on","at","for","with","from","by","about","into","over","as",
  "this","that","these","those","there","here","it","its","i","you","he",
  "she","we","they","me","him","her","us","them","my","your","his","our",
  "their","do","does","did","done","have","has","had","can","could","will",
  "would","should","may","might","what","when","where","which","who","why",
  "how","find","search","note","notes","please","tell","show","give","get",
  "want","wants","wanted","need","needs","needed",
  // French
  "le","la","les","un","une","des","du","de","au","aux","et","ou","ne",
  "pas","plus","tres","sur","sous","dans","par","pour","avec","sans","entre",
  "ma","mon","mes","ta","ton","tes","sa","son","ses","notre","votre","leur",
  "leurs","ce","cet","cette","ces","est","sont","ai","as","ont","etait",
  "etaient","ete","fait","faire","faut","ai","si","mais","car","donc","or",
  "que","qui","quoi","dont","ou","comme","tout","tous","toute","toutes",
  "moi","toi","lui","eux","elles","ils","elle","il","on","nous","vous",
  "trouve","trouver","cherche","chercher","montre","montrer","dis","donne",
  "donner","ouvre","ouvrir","quelle","quel","quelles","quels","liste",
  "lister","afficher",
  "je","veux","voudrais","besoin","comment","peux","peut","a",
  "suis","est","sait","savoir",
]);

// ── Weak tokens ────────────────────────────────────────────────────────
// These tokens survive stop-word filtering but carry no real subject
// information. "config jellyfin" → "config" is weak, "jellyfin" is the
// anchor. When the query contains at least one non-weak (anchor) token,
// notes that ONLY matched weak tokens are pruned before the model sees
// them. Weak tokens still score at 25 % weight so they help rank notes
// that already matched the real subject.
const WEAK_TOKENS = new Set([
  // generic tech/doc labels
  "config","configuration","configs",
  "commande","commandes","cmd",
  "tuto","tutoriel","guide",
  "procedure","procedures",
  "installation","installer","install",
  "setup",
  "parametre","parametres","setting","settings","param","params",
  "info","infos","information","informations",
  "documentation","doc","docs",
  "resume","synthese",
  "recherche",
]);

// ── Synonyms ───────────────────────────────────────────────────────────
// Single-word equivalences. Built as a symmetric map so a query for
// "wallet" expands to "portefeuille" and vice versa. Multi-word terms
// (e.g. "seed phrase") are handled implicitly by phrase bonuses on the
// full normalized question, not here.
const SYNONYM_GROUPS = [
  ["wallet", "portefeuille"],
  ["crypto", "cryptomonnaie", "cryptocurrency"],
  ["seed", "mnemonic", "mnemonique"],
  ["password", "motdepasse", "mdp"],
  ["login", "identifiant"],
  ["address", "adresse"],
  ["server", "serveur"],
  ["key", "cle"],
  ["docker", "container", "conteneur"],
  ["vpn", "tunnel"],
];

const SYNONYMS = (() => {
  const map = new Map();
  for (const group of SYNONYM_GROUPS) {
    for (const word of group) {
      const set = map.get(word) || new Set();
      for (const other of group) if (other !== word) set.add(other);
      map.set(word, set);
    }
  }
  return map;
})();

// ── Normalization helpers ──────────────────────────────────────────────

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip combining diacritics
}

function tokenize(s) {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
}

// Conservative singular/plural expansion. Only ONE rule applies per
// token (else if), so "entries" → {entries, entry} (not also "entrie").
function expandPluralVariants(tok) {
  const v = new Set([tok]);
  if (tok.length > 4 && tok.endsWith("ies")) {
    v.add(tok.slice(0, -3) + "y");        // entries → entry
  } else if (tok.length > 3 && tok.endsWith("s") && !tok.endsWith("ss")) {
    v.add(tok.slice(0, -1));              // wallets → wallet
  }
  return v;
}

// Full variant set for one query token = plural variants of the token
// AND of each of its synonyms. Each synonym also gets its plural pass.
function expandToken(tok) {
  const out = new Set();
  for (const base of expandPluralVariants(tok)) {
    out.add(base);
    const syns = SYNONYMS.get(base);
    if (syns) {
      for (const s of syns) {
        for (const sv of expandPluralVariants(s)) out.add(sv);
      }
    }
  }
  return out;
}

// Match strategy depends on variant length. Short variants (≤3 chars
// like "vm", "ssh", "cle", "mdp") use exact token match against a Set,
// otherwise "vm" matches inside "lvm" / "kvm" / "vmware" via substring
// and creates lots of false positives. Longer variants keep substring
// matching so plurals, compound words and inflections still match.
function variantInField(variant, fieldStr, fieldTokenSet) {
  if (!variant) return false;
  if (variant.length <= 3) return fieldTokenSet.has(variant);
  return fieldStr.includes(variant);
}

function countVariantInBody(variant, bodyStr, bodyTokenSet) {
  if (!variant) return 0;
  if (variant.length <= 3) {
    if (!bodyTokenSet.has(variant)) return 0;
    const re = new RegExp(`(?:^|[^a-z0-9])${variant}(?:[^a-z0-9]|$)`, "g");
    const matches = bodyStr.match(re);
    return matches ? matches.length : 0;
  }
  let idx = 0;
  let hits = 0;
  while (true) {
    const found = bodyStr.indexOf(variant, idx);
    if (found === -1) break;
    hits++;
    idx = found + variant.length;
  }
  return hits;
}

module.exports = {
  STOP_WORDS,
  WEAK_TOKENS,
  SYNONYMS,
  normalize,
  tokenize,
  expandPluralVariants,
  expandToken,
  variantInField,
  countVariantInBody,
};
