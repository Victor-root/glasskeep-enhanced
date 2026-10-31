// scripts/lib/dockerCreateConfig.cjs
//
// The "create" payload of the container that replaces GlassKeep's during a
// Docker update, for docker-update-helper.cjs.
//
// A container's inspect output mixes what its image set (ENV, labels,
// command, working directory...) with what the admin set (compose
// `environment:`, ports, volumes). Copying it whole made the new
// container keep the OLD image's values over the new image's: its
// GLASSKEEP_COMMIT, so a beta updated to a newer beta still announced
// the old commit and offered the update again. Whatever is identical to
// the old image's own config is left out, so the new image supplies it;
// what the admin set is kept.

// Config fields an image defines, compared whole.
const IMAGE_FIELDS = [
  "Cmd", "Entrypoint", "WorkingDir", "User", "Healthcheck",
  "ExposedPorts", "Volumes", "StopSignal", "Shell", "OnBuild",
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// `inspect`: the running container's inspect output. `oldImageConfig`:
// the Config of the image it runs (GET /images/<id>/json).
function buildCreateConfig(inspect, newImage, oldImageConfig) {
  const image = oldImageConfig || {};
  const cfg = { ...(inspect.Config || {}) };
  cfg.Image = newImage;
  // Hostname / Domainname must NOT be inherited. Docker auto-fills
  // Hostname with the container's short ID when left empty, but the
  // inspect output captures the OLD container's ID: preserving it
  // freezes the new container's /etc/hostname at a stale value and
  // breaks the next self-update (the orchestrator can no longer find
  // its own container by hostname).
  delete cfg.Hostname;
  delete cfg.Domainname;

  const imageEnv = new Set(image.Env || []);
  if (Array.isArray(cfg.Env)) cfg.Env = cfg.Env.filter((entry) => !imageEnv.has(entry));
  if (cfg.Labels && typeof cfg.Labels === "object") {
    const imageLabels = image.Labels || {};
    cfg.Labels = Object.fromEntries(
      Object.entries(cfg.Labels).filter(([key, value]) => imageLabels[key] !== value),
    );
  }
  for (const field of IMAGE_FIELDS) {
    if (field in cfg && same(cfg[field], image[field])) delete cfg[field];
  }

  const hostConfig = { ...(inspect.HostConfig || {}) };

  // NetworkingConfig: rebuild from the live network attachments so
  // the new container ends up on the same user-defined networks
  // (the common docker-compose case). We strip per-instance fields
  // (IPs, MAC, EndpointID); Docker will re-assign them.
  const networkingConfig = { EndpointsConfig: {} };
  const nets = inspect.NetworkSettings && inspect.NetworkSettings.Networks;
  if (nets && typeof nets === "object") {
    for (const [name, net] of Object.entries(nets)) {
      networkingConfig.EndpointsConfig[name] = {
        Aliases: Array.isArray(net.Aliases) ? net.Aliases : undefined,
        Links: Array.isArray(net.Links) ? net.Links : undefined,
      };
    }
  }

  return { ...cfg, HostConfig: hostConfig, NetworkingConfig: networkingConfig };
}

module.exports = { buildCreateConfig };
