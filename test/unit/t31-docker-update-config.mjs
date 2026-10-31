// Le conteneur qui remplace celui de GlassKeep lors d'une mise à jour
// Docker prend les réglages de la nouvelle image et garde ceux de
// l'administrateur.
//
// TROUVÉ EN TESTANT LA BÊTA: une bêta mise à jour vers une bêta plus
// récente annonçait toujours l'ancien commit et reproposait la mise à
// jour. Le nouveau conteneur recopiait toutes les variables de l'ancien,
// dont GLASSKEEP_COMMIT, que l'image elle-même fournit.
//
// Le conteneur d'exemple est celui que crée le docker-compose.yml du
// README: variables de l'image (PATH, NODE_VERSION, GLASSKEEP_COMMIT)
// mêlées à celles du compose (ADMIN_EMAIL...), étiquettes de l'image et
// de compose, commande de l'image.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runner } from "../federation/lib.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { buildCreateConfig } = require(path.join(ROOT, "scripts", "lib", "dockerCreateConfig.cjs"));
const t = runner("La mise à jour Docker prend les réglages de la nouvelle image");

const oldImage = {
  Env: ["PATH=/usr/local/sbin:/usr/local/bin:/usr/bin:/bin", "NODE_VERSION=26.1.0", "GLASSKEEP_COMMIT=70e449d28b00998e11ab5daf6f3cdb05c7cb158c"],
  Labels: { "org.opencontainers.image.revision": "70e449d2" },
  Entrypoint: ["/usr/local/bin/entrypoint.sh"],
  Cmd: ["node", "server/index.js"],
  WorkingDir: "/app",
  ExposedPorts: { "8080/tcp": {} },
  Volumes: { "/data": {} },
};
const inspect = {
  Image: "sha256:ancienne",
  Config: {
    Hostname: "3f2a1b0c9d8e",
    Image: "ghcr.io/victor-root/glasskeep-enhanced:beta",
    Env: [...oldImage.Env, "ADMIN_EMAIL=admin", "ADMIN_PASSWORD=admin"],
    Labels: { ...oldImage.Labels, "com.docker.compose.project": "glasskeep", "com.docker.compose.service": "glasskeep" },
    Entrypoint: oldImage.Entrypoint,
    Cmd: oldImage.Cmd,
    WorkingDir: "/app",
    ExposedPorts: oldImage.ExposedPorts,
    Volumes: oldImage.Volumes,
  },
  HostConfig: {
    Binds: ["/root/glasskeep/data:/data:rw", "/var/run/docker.sock:/var/run/docker.sock:rw"],
    PortBindings: { "8080/tcp": [{ HostIp: "", HostPort: "8080" }] },
    RestartPolicy: { Name: "unless-stopped" },
  },
  NetworkSettings: { Networks: { glasskeep_default: { Aliases: ["glasskeep"], IPAddress: "172.18.0.2", EndpointID: "x" } } },
};

const cfg = buildCreateConfig(inspect, "ghcr.io/victor-root/glasskeep-enhanced:beta-70ac77e9", oldImage);

t.check("le nouveau conteneur ne garde aucune variable de l'ancienne image, dont son commit",
  !cfg.Env.some((e) => /^(PATH|NODE_VERSION|GLASSKEEP_COMMIT)=/.test(e)), cfg.Env.join(" "));
t.check("il garde les variables du compose", cfg.Env.join() === "ADMIN_EMAIL=admin,ADMIN_PASSWORD=admin", cfg.Env.join());
t.check("il garde les étiquettes de compose, pas celles de l'ancienne image",
  JSON.stringify(cfg.Labels) === JSON.stringify({ "com.docker.compose.project": "glasskeep", "com.docker.compose.service": "glasskeep" }),
  JSON.stringify(cfg.Labels));
t.check("la commande, le point d'entrée et le dossier de travail viennent de la nouvelle image",
  !("Cmd" in cfg) && !("Entrypoint" in cfg) && !("WorkingDir" in cfg) && !("ExposedPorts" in cfg) && !("Volumes" in cfg));

const custom = buildCreateConfig({ ...inspect, Config: { ...inspect.Config, Cmd: ["node", "server/index.js", "--trace"] } },
  "ghcr.io/victor-root/glasskeep-enhanced:beta-70ac77e9", oldImage);
t.check("une commande choisie par l'administrateur est gardée", JSON.stringify(custom.Cmd) === '["node","server/index.js","--trace"]');

t.check("il tourne sur la nouvelle image, avec un nom d'hôte neuf",
  cfg.Image.endsWith(":beta-70ac77e9") && !("Hostname" in cfg));
t.check("il garde les dossiers montés, les ports, la relance automatique et le réseau",
  cfg.HostConfig.Binds.length === 2 && cfg.HostConfig.PortBindings["8080/tcp"][0].HostPort === "8080"
    && cfg.HostConfig.RestartPolicy.Name === "unless-stopped"
    && JSON.stringify(cfg.NetworkingConfig.EndpointsConfig.glasskeep_default) === '{"Aliases":["glasskeep"]}');

process.exit(t.summary() ? 0 : 1);
