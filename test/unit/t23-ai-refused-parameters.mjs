// Les modèles récents d'OpenAI (gpt-5, la série o) refusent `max_tokens`
// et veulent `max_completion_tokens`, et n'acceptent que leur température
// par défaut. Ils le disent dans une erreur 400 qui nomme le paramètre.
//
// TROUVÉ PAR UN UTILISATEUR (issue #34): le test de connexion à OpenAI
// échouait avec ces modèles, alors que `gpt-4.1-mini` passait.
//
// La règle vérifiée ici: GlassKeep apprend du refus, renvoie la demande
// corrigée et s'en souvient pour ce modèle, sans rien changer pour les
// modèles et les services qui acceptent l'ancienne forme.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runner } from "../federation/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const require = createRequire(import.meta.url);
const provider = require(path.join(ROOT, "server", "ai", "openaiCompatibleProvider.js"));
const t = runner("L'IA s'adapte aux paramètres qu'un modèle refuse");

const recus = [];
const refus = (res, param, code, message) => {
  res.writeHead(400, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { message, type: "invalid_request_error", param, code } }));
};
const serveur = http.createServer((req, res) => {
  let data = "";
  req.on("data", (c) => { data += c; });
  req.on("end", () => {
    const corps = JSON.parse(data);
    recus.push(corps);
    if (corps.model === "nouveau") {
      if ("max_tokens" in corps) {
        return refus(res, "max_tokens", "unsupported_parameter",
          "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.");
      }
      if ("temperature" in corps && corps.temperature !== 1) {
        return refus(res, "temperature", "unsupported_value",
          "Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported.");
      }
    }
    if (corps.model === "casse") return refus(res, "messages", "invalid_value", "Invalid messages.");
    if (corps.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "OK" } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
      return res.end("data: [DONE]\n\n");
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }));
  });
});
await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${serveur.address().port}/v1`;
const cfg = (model) => ({ enabled: true, baseUrl: base, model, allowPrivateEndpoint: true, temperature: 0.3, maxTokens: 800 });

try {
  recus.length = 0;
  const ancien = await provider.testConnection(cfg("ancien"));
  t.check("un modèle qui accepte max_tokens le reçoit, en une seule demande",
    ancien.content === "OK" && recus.length === 1 && recus[0].max_tokens === 16 && recus[0].temperature === 0,
    JSON.stringify(recus));

  recus.length = 0;
  const nouveau = await provider.testConnection(cfg("nouveau"));
  const derniere = recus.at(-1);
  t.check("un modèle récent passe: la demande est renvoyée sans ce qu'il refuse",
    nouveau.content === "OK" && recus.length === 3
      && !("max_tokens" in derniere) && derniere.max_completion_tokens === 16 && !("temperature" in derniere),
    JSON.stringify(recus));

  recus.length = 0;
  await provider.chatCompletion(cfg("nouveau"), { messages: [{ role: "user", content: "Salut" }] });
  t.check("la leçon est retenue pour ce modèle: une seule demande la fois suivante",
    recus.length === 1 && recus[0].max_completion_tokens === 800, JSON.stringify(recus));

  recus.length = 0;
  const morceaux = [];
  for await (const m of provider.chatCompletionStream(cfg("nouveau"), { messages: [{ role: "user", content: "Salut" }] })) {
    morceaux.push(m);
  }
  t.check("le mode continu en profite aussi",
    recus.length === 1 && morceaux.some((m) => m.delta === "OK"), JSON.stringify(morceaux));

  recus.length = 0;
  const autreAdresse = await provider.testConnection({ ...cfg("nouveau"), baseUrl: base.replace("127.0.0.1", "localhost") });
  t.check("ce qui est appris vaut pour ce service et ce modèle seulement",
    autreAdresse.content === "OK" && recus.length === 3, String(recus.length));

  recus.length = 0;
  let erreur = null;
  try { await provider.testConnection(cfg("casse")); } catch (e) { erreur = e; }
  t.check("tout autre refus est rapporté tel quel, sans nouvel essai",
    erreur?.message === "AI provider error: Invalid messages." && recus.length === 1, erreur?.message);
} finally {
  serveur.close();
}

process.exit(t.summary() ? 0 : 1);
