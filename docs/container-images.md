# Published website image

Successful `main` builds publish `ghcr.io/pustka-sh/site:latest` and `ghcr.io/pustka-sh/site:sha-FULL_COMMIT_SHA`. The image currently targets `linux/amd64`; the workflow verifies that architecture. The Actions run summary records the exact registry digest for pinning a deployment or rolling back to a known image. Branches and pull requests run the build and smoke checks without publishing.

Commit tags identify the source revision. Rebuilding the same revision can refresh that tag when base images or operating-system packages change; use the exact digest when a deployment must retain the same image bytes.

The build job tests the application and Docker image, including database persistence, then saves that exact image as a one-day artifact. A separate publisher downloads this run's artifact, verifies its source/revision labels, and pushes it without rebuilding. Only the trusted main publisher receives `packages: write`; it uses GitHub's short-lived `GITHUB_TOKEN`. No registry password, documentation publishing key, or other application credential is baked into the image. Runtime secrets stay in the server's environment.

After pushing, the publisher reads both tag digests from the registry and requires them to match before reporting success. Local Docker references can still name the saved archive's source alias, so they are not used as evidence of registry publication. Each push has one bounded retry of the same image to recover from a transient registry rejection; persistent failures still fail the workflow.

## First publication

1. Merge the publishing workflow to `main` and let its Build workflow finish. You can also run Build manually on `main` after the workflow is available there.
2. Open the [Site container package settings](https://github.com/orgs/pustka-sh/packages/container/site/settings). GitHub creates new packages as **private**, including packages linked to public repositories. Set the package to **Public** if Proxmox should download it without credentials. The image contains the public site source and its runtime dependencies; `.env` and runtime data are excluded.
3. Verify an unauthenticated download of `ghcr.io/pustka-sh/site:latest` before relying on public pulls. The workflow's final step records whether anonymous manifest access worked at publication time. If a package remains private, the Docker host or Proxmox registry configuration needs appropriate registry read credentials; the documentation signing key is unrelated to registry authentication.

An existing package of the same name that was published elsewhere must grant this repository's Actions access before the publisher can update it. Repository source labels are included in the production image to establish its source association.

## Run with Docker Compose

Keep `compose.registry.yml` in the existing Site directory alongside the existing `.env`. Use the same Compose project name/directory as the current deployment so it reuses `site-data` rather than creating an empty replacement volume.

```sh
docker compose -f compose.registry.yml pull
docker compose -f compose.registry.yml up -d
docker compose -f compose.registry.yml ps
```

This configuration downloads the ready-built image; it does not require Node.js or Java on the Docker host. Source builds using `compose.yml` remain available.

Keep `PUBLIC_ORIGIN=https://pustka.sh` and the existing application settings in `.env`. Add the server's private `DOCS_PUBLISH_KEYS` mapping there; Relay Actions uses the matching raw key in `PUSTKA_DOCS_PUBLISH_KEY`. After editing environment settings, recreate the container so it reads them:

```sh
docker compose -f compose.registry.yml up -d --no-deps --force-recreate site
```

`docker restart` keeps the existing environment. Recreating the container preserves `/data` through the named volume. Never remove that volume during an update; it holds published documentation, shared configs, and feedback.

The default host binding is `127.0.0.1:3000`, suitable for an HTTPS reverse proxy on the same Docker host. If the proxy is in another VM/container, set `BIND_ADDRESS` to the Docker guest's reachable interface address and allow that proxy through the firewall. Set `TRUST_PROXY` to the actual proxy address/range. Point the domain and HTTPS reverse proxy at the reachable guest and port.

For a pinned deployment, set `SITE_IMAGE` in `.env` to the complete commit tag or exact digest printed by the publishing run. Repeat `pull` and `up -d` to update. Publishing a new image does not update a running container automatically.

## Proxmox native application containers

Proxmox's OCI image feature can pull from registries on supported versions, but its application-container support is currently a technology preview. The workflow publishes a Docker/OCI-compatible image; this repository's runtime is tested with Docker, and its native Proxmox import has not been validated on your cluster.

Importing an image does not apply the Compose file. Configure these settings in the selected Proxmox guest before exposing the site:

| Setting | Required value |
| --- | --- |
| Image | `ghcr.io/pustka-sh/site:latest`, a commit tag, or a pinned digest |
| Architecture | `amd64` |
| Application command | Image default: `node server/index.mjs`, working directory `/app` |
| Runtime identity | Image user `node`, UID/GID `1000` |
| Listener | TCP `3000` on the guest; route HTTPS through your proxy |
| Persistent data | Writable `/data`, accessible to the runtime identity |
| Environment | `NODE_ENV=production`, `PORT=3000`, `HOST=0.0.0.0`, `DATA_DIR=/data`, `PUBLIC_ORIGIN=https://pustka.sh`, plus private application settings |
| Health probe | HTTP `GET /health` on port `3000` |

The image includes a writable data volume declaration and its normal Node entry point. Check how your Proxmox version maps the image user, entry point, mounts and environment. Compose also supplies a read-only root filesystem, temporary `/tmp`, dropped capabilities, restart behavior and resource limits; configure equivalent controls where the selected runtime supports them. Preserve `/data` and verify health, a page, and data after guest restart before using the site publicly.

References: [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [publishing images from GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images), [Proxmox container images](https://github.com/proxmox/pve-docs/blob/master/pct.adoc).
