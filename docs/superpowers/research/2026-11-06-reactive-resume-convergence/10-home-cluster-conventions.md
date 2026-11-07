# home-cluster GitOps conventions for a new app

Subagent research report, 2026-11-06. Model output: claims carry file:line evidence or are labelled inference; verify against the code before relying on one.

All claims below were read from files in ~/dev/home-cluster. Nothing was run against the cluster, nothing under `private/` was read except `private/reactive-resume-setup.md`, and `cluster.toml` was not opened (I used the sample and the fixtures). "Inferred" marks anything not read directly.

## 1. Repo shape

- **Origin.** The repo is a fork of onedr0p/cluster-template running on Talos with Flux (`CLAUDE.md`). `cluster.toml` is gitignored and holds all config.
- **Top level.** `template/`, `kubernetes/`, `bootstrap/`, `talos/`, `docs/`, `private/` (gitignored guides), `cluster.sample.toml`, `cluster.schema.json`, `makejinja.toml`, `justfile`, `.claude/rules/`.
- **Rendering.** `just configure` runs makejinja (`makejinja.toml`).
  - It renders `template/config/**/*.j2` into the repo root, so `template/config/kubernetes/apps/<ns>/...` becomes `kubernetes/apps/<ns>/...`.
  - Delimiters are `#{ var }#`, `#% if x %#` and `#| comment #|`. Plain `{{ }}` and Flux `${SECRET_DOMAIN}` pass through to the output. `undefined = "strict"`, so a misspelled variable fails the whole render (`.claude/rules/templates.md`).
  - Rendered files are committed. Flux reconciles `kubernetes/` from Git. Edit the `.j2`, never the rendered copy; `.claude/skills/cluster-guard` blocks writes into the rendered trees.
  - `just configure` also sops-encrypts every `*.sops.*` file. It re-encrypts all of them each run, so afterwards restore the ones whose inputs did not change: `git checkout -- ':(glob)bootstrap/**/*.sops.*' ':(glob)kubernetes/**/*.sops.*' ':(glob)talos/**/*.sops.*'` (`CLAUDE.md`).
- **Validator.** `template/scripts/validate.py` is the only definition of `cluster.toml`.
  - It is a pydantic model with `extra="forbid"`. `Plugin.data()` in `template/scripts/plugin.py` hands the validated data to the templates.
  - Computed gates such as `reactive_resume_enabled` are properties on the root model (`validate.py:937`). Cross-field `ValueError`s sit near `validate.py:1235-1255`.
  - A schema change touches four places: `validate.py`, `cluster.sample.toml`, `cluster.schema.json` (from `just template schema`), and fixtures in `.github/template-tests/valid/` and `invalid/`. Invalid fixtures carry a `# expect:` line. The `public.toml` fixture sets every section. Source: `.claude/rules/validator.md`.
  - `cluster.toml` must keep the section order of `cluster.sample.toml` (`just template check-layout`, `just template scaffold <section>`).
- **Flux layout.** `template/config/kubernetes/flux/cluster/ks.yaml.j2` defines `cluster-apps` with `path: ./kubernetes/apps`.
  - Its patch gives every child Kustomization `decryption: sops` and every HelmRelease (unless labelled `home-cluster.io/remediation: manual`) `RemediateOnFailure` with 2 retries.
  - There is no top-level `kubernetes/apps/kustomization.yaml` (checked). I inferred that Flux generates one and picks up each namespace folder's `kustomization.yaml`; a disabled app's `#% if %#` wrapper then renders an empty file. I did not confirm how empty renders are handled.
- **Per-namespace layout** (`.claude/rules/flux-apps.md`, `template/config/kubernetes/apps/default/echo/ks.yaml.j2`).
  - `apps/<ns>/kustomization.yaml` sets `namespace:`, includes `../../components/sops`, and lists `./namespace.yaml` plus each `./<app>/ks.yaml`.
  - `apps/<ns>/<app>/ks.yaml` is a Flux Kustomization. Standard fields: `path: ./kubernetes/apps/<ns>/<app>/app`, `interval: 1h`, `prune: true`, `targetNamespace`, `sourceRef` to `flux-system`, `postBuild.substituteFrom` the `cluster-secrets` Secret (gives `${SECRET_DOMAIN}`), `wait: false`.
  - `dependsOn` is used only for a real ordering need. Any app with CNPG Postgres depends on `cloudnative-pg` and `plugin-barman-cloud`, both in `cnpg-system`.
  - `apps/<ns>/<app>/app/` holds `kustomization.yaml`, `helmrelease.yaml`, `ocirepository.yaml`, and extra manifests.
  - `namespace.yaml` sets `pod-security.kubernetes.io/enforce: restricted` (`baseline` only for `network`).
  - `components/sops` renders the `cluster-secrets` Secret with `SECRET_DOMAIN` (`template/config/kubernetes/components/sops/`).
- **Secrets.** `secret.sops.yaml.j2` renders a Secret with `stringData:` taken from `cluster.toml` values. Only `data` and `stringData` are encrypted (`.sops.yaml`). One Secret per sops file, because a second makes the MAC fail (`.claude/rules/flux-apps.md`). `.sops.yaml`, `age.key` and `cluster.toml` are not readable by me and I did not try.
- **Rules.**
  - `CLAUDE.md` says each `cluster.toml` section gets its own `.claude/rules/apps/<name>.md`, with `paths` on its namespace, and its name added to the index line under Detected Patterns.
  - Other rules: `.claude/rules/{flux-apps,templates,validator,talos,docs}.md`.
  - Formatting: `oxfmt --check` must pass on rendered YAML, with 2-space indent.
  - Renovate: no `# renovate:` comments in app YAML. Renovate reads chart tags and image tags in `.yaml.j2` directly (`.renovaterc.json5`, preset home-operations/renovate-presets 10.0.1).
  - Before finishing: `uv run --locked pytest template/scripts/test_validate.py -q`. The Stop hook (`.claude/hooks/stop.py`) renders every valid fixture, so a new conditional branch needs a fixture that takes it.

## 2. Reactive Resume worked example

**Files**
- Templates, under `template/config/kubernetes/apps/reactive-resume/`: `kustomization.yaml.j2`, `namespace.yaml.j2`, `reactive-resume/ks.yaml.j2`, and in `reactive-resume/app/`: `cluster.yaml.j2`, `helmrelease.yaml.j2`, `kustomization.yaml.j2`, `networkpolicy.yaml.j2`, `ocirepository.yaml.j2`, `scheduledbackup.yaml.j2`, `secret.sops.yaml.j2`.
- Rendered, under `kubernetes/apps/reactive-resume/`: the same 10 files without `.j2`, and all are tracked in git. I compared the rendered `ks.yaml` and `kustomization.yaml` to their templates; they match apart from the `#% if %#` wrapper.
- Every template is wrapped in `#% if reactive_resume_enabled %#`.

**Gating and validation**
- `[reactive_resume]` in `cluster.sample.toml` (around line 616-670) has 8 keys: `auth_secret`, `encryption_secret`, `oidc_client_id`, `oidc_client_secret`, `s3_endpoint`, `s3_bucket`, `s3_access_key_id`, `s3_secret_access_key`.
- The class `ReactiveResume` is at `validate.py:458`. The enable flag is `reactive_resume_enabled == (auth_secret != "")` (`validate.py:937`).
- `_all_or_none(...)` requires all 8 fields or none.
- `LongSecret` enforces at least 32 characters. `oidc_client_id` has a character-class regex. `s3_endpoint` must be `https://host` with no path. `s3_bucket` has a bucket-name regex.
- Cross-field rules (`validate.py:1242-1250`): it requires `pocket_id_enabled` and `ingress.mode != "none"`.
- Rule file: `.claude/rules/apps/reactive-resume.md`.

**HelmRelease** (`.../app/helmrelease.yaml.j2`)
- Chart: bjw-s app-template. `ocirepository.yaml.j2` uses `oci://ghcr.io/bjw-s-labs/helm/app-template`, `ref.tag: 5.3.0`.
- It is referenced with `chartRef: {kind: OCIRepository, name: reactive-resume}`.
- Controller annotation `reloader.stakater.com/auto: "true"`, so a secret change restarts the pod.
- Image: `ghcr.io/reactive-resume/reactive-resume` tag `v6.0.10`, with no digest. Other apps do pin digests (see section 5).
- Init container `wait-for-database`: `busybox:1.38`, loops `nc -z reactive-resume-db-rw 5432`.
- Env:
  - Plain env in the HelmRelease: `APP_URL`, `TRUSTED_PROXIES` (set to `kubernetes.pod_cidr`), `OAUTH_PROVIDER_NAME`, `OAUTH_CLIENT_ID`, `OAUTH_DISCOVERY_URL: https://auth.${SECRET_DOMAIN}/.well-known/openid-configuration`, `FLAG_DISABLE_EMAIL_AUTH`, `S3_BUCKET`, `S3_REGION`.
  - `DATABASE_URL` from `secretKeyRef` `reactive-resume-db-app` key `uri`.
  - `envFrom` the sops Secret `reactive-resume-secret`.
- Probes: startup and readiness are custom httpGet on `/`. Liveness is disabled, deliberately.
- Resources: requests 250m CPU / 512Mi, limit memory 1Gi, no CPU limit.
- Security: `restricted`-compliant, uid/gid 1000, `readOnlyRootFilesystem`, all capabilities dropped, seccomp RuntimeDefault.
- Persistence: `/app/data` and `/tmp` are emptyDirs. The app has no PVC; its uploads go to S3.

**Route**
- Inline `route.app` in the HelmRelease, with hostname `resume.${SECRET_DOMAIN}` and a parentRef to `envoy-external` / `network` / `sectionName: https`.

**Postgres**
- `cluster.yaml.j2` is a CNPG `Cluster` `reactive-resume-db`: 2 instances on `local-path` 2Gi, Postgres major 18 from `imageCatalogRef` `postgresql`, the barman-cloud plugin as WAL archiver (`barmanObjectName: postgres-backup`), and `primaryUpdateMethod: switchover`.
- Anti-affinity is `required` when more than one schedulable node exists, otherwise `preferred`.
- `scheduledbackup.yaml.j2` is a daily backup at 04:00 (six-field cron), method plugin, `immediate: true`.
- The app `kustomization.yaml.j2` includes `components: ../../../../components/postgres`. That component (in `template/config/kubernetes/components/postgres/`) holds an `imagecatalog`, an `objectstore` (the `postgres-backup` target), a networkpolicy, a podmonitor and a sops secret.
- Requires `[postgres.backup]`. The doc says the requirement chain is reactive_resume, then pocket_id, then postgres.backup.

**NetworkPolicy**
- `networkpolicy.yaml.j2` admits only the `network` namespace on TCP 3000, because the app trusts `X-Forwarded-For` from the whole pod CIDR.

**Pocket ID client** (`private/reactive-resume-setup.md`)
1. In Pocket ID, go to Admin, OIDC Clients, Add.
2. Name it, and set the callback `https://resume.<domain>/api/auth/callback/custom`.
3. Copy the client ID and secret. The secret is shown once.
4. Put `oidc_client_id` and `oidc_client_secret` in `cluster.toml`, run `just configure`, restore unchanged sops files, commit and push.
5. Pocket ID itself must be public (`pocket_id.public = true`), so a browser away from home can finish sign-in.
6. The first Pocket ID login creates the account. The setup doc says to restrict the client to a group if you want fewer users; it did not check whether later users also self-register.

## 3. Gateway and auth

- **Gateways.** `template/config/kubernetes/apps/network/envoy-gateway/app/envoy.yaml.j2` defines GatewayClass `envoy`, an EnvoyProxy, and two Gateways in `network`.
  - `envoy-external` exists only if `ingress.mode != 'none'`. It carries the target `external.${SECRET_DOMAIN}` and an LB IP from `gateways.external`.
  - `envoy-internal` carries `internal.${SECRET_DOMAIN}` and `gateways.internal`.
  - Each has an `http` listener (same-namespace only, used for the https redirect) and an `https` listener (routes from all namespaces; wildcard TLS Secret `${SECRET_DOMAIN/./-}-production-tls`).
  - Envoy runs 2 replicas when there is more than one node. Other policies in that file: BackendTrafficPolicy compression with `requestTimeout: 0s`, ClientTrafficPolicy trusting `X-Forwarded-For` from the pod CIDR, and an `https-redirect` HTTPRoute.
- **Version.** `network/envoy-gateway/app/ocirepository.yaml.j2` pins `oci://mirror.gcr.io/envoyproxy/gateway-helm`, `ref.tag: 1.9.3`.
- **DNS and tunnel** (`.claude/rules/apps/unifi-dns.md`, `network.md`, `private/reactive-resume-setup.md`).
  - `cloudflare-dns` publishes `envoy-external` routes; `cloudflare-tunnel` (2 `cloudflared` replicas) carries the external traffic.
  - `unifi-dns` writes local UniFi DNS records only for `envoy-internal` routes. An external-only app is therefore reached through the tunnel even from the LAN, and the setup doc says as much.
  - Pods reach `auth.<domain>` through a CoreDNS `hosts` entry (added by `[pocket_id]`) or the UniFi forward.
- **Public and internal hostnames.** The route can attach to both gateways under different hostnames, or one hostname can be on both.
  - Precedent for one hostname: `template/config/kubernetes/apps/media/seerr/app/httproute.yaml.j2` attaches to `envoy-internal` and also to `envoy-external` when `media.public`.
  - The pegaprox docs and others use internal only. I found no app that serves two separate hostnames for the same backend, but nothing prevents two HTTPRoutes (inferred).
- **Gateway-level OIDC is used in this repo.** Envoy Gateway `SecurityPolicy` (`gateway.envoyproxy.io/v1alpha1`) with an `oidc` block against Pocket ID. oauth2-proxy and forward-auth are not used (a grep for them found no matching templates).
  - `template/config/kubernetes/apps/media/shared/app/securitypolicy.yaml.j2` selects HTTPRoutes by label with `targetSelectors` (`media.sign-in: pocket-id`).
    - It sets `provider.issuer`, `authorizationEndpoint` and `tokenEndpoint` explicitly: `https://auth.${SECRET_DOMAIN}`, `/authorize`, `/api/oidc/token`.
    - `clientID` comes from `cluster.toml`. `clientSecret` references a Secret by name (`media-oidc`, key `client-secret`, see `media/shared/app/oidc-secret.sops.yaml.j2`).
    - Scopes are `openid profile email groups`. `cookieNames.idToken` is fixed.
    - A `jwt.providers` entry with `audiences: [clientID]` and `remoteJWKS` at `/.well-known/jwks.json` backs `authorization.defaultAction: Deny` plus a rule allowing the `groups` claim `cluster_admins`.
    - `redirectURL` is left unset, so each route gets its own `/oauth2/callback`. Every route's callback URL must be listed on the Pocket ID client.
  - The same shape is used by `template/config/kubernetes/apps/ai/localai/app/securitypolicy.yaml.j2` (`targetRefs` to one route) and `template/config/kubernetes/apps/kube-system/cilium/app/hubble-securitypolicy.yaml.j2` (I did not read the Hubble file).
  - Pattern the media app takes: gateway sign-in plus a NetworkPolicy that admits only the `network` namespace, with the app set to trust whoever reaches it (arrs run `AUTH__METHOD=External`, `.claude/rules/apps/media.md`). An `/api` route without the policy is served on internal only, so API-key clients bypass the gateway login.
  - So for this repo's new app, the house way is a SecurityPolicy, not in-app OIDC, when the app has no OIDC support. In-app OIDC (Reactive Resume, Network Optimizer) is used when the app supports it.
- **Pocket ID deployment.** The `security` namespace, `security/pocket-id` on app-template, at `auth.${SECRET_DOMAIN}` on `envoy-internal`; with `pocket_id.public = true` it is also attached to `envoy-external` (`.claude/rules/apps/pocket-id.md`).
  - State is in the CNPG cluster `pocket-id-db`, so the pod has no volume. A NetworkPolicy admits only the `network` namespace on port 1411.
  - The HelmRelease carries `home-cluster.io/remediation: manual` with 0 retries, because Pocket ID refuses to start on a database a newer version has migrated.
  - Passkeys bind to the hostname, so it must not change.

## 4. Storage and jobs

- **Storage classes.** Only `local-path` and a static NFS PV:
  - `local-path` is the default (`storage/local-path-provisioner`). Volumes are directories under `/var/mnt/local-path`, defined in `talos/all/72-volumes.yaml`, node-pinned, with no quota and reclaim `Delete`.
  - NFS is used only by media: a static PV/PVC (`media/shared/app/pv.yaml.j2`, `pvc.yaml.j2`, storageClassName `media`) served by `storage/csi-driver-nfs`. Its `nodeAffinity` pins everything that claims it to one node.
  - A grep of `template`, `kubernetes` and `.claude/rules` for longhorn and rook-ceph found nothing. So there is no RWX replicated storage and no volume snapshot class.
- **Declaring a PVC.** In an app-template HelmRelease `persistence:` block, as in `template/config/kubernetes/apps/network-optimizer/network-optimizer/app/helmrelease.yaml.j2`.
  - Values: `type: persistentVolumeClaim`, `storageClass: local-path`, `accessMode: ReadWriteOnce`, `size: 5Gi`, `advancedMounts` per controller and container.
  - For state that exists nowhere else, add `forceRename: <claim name>` and `retain: true`, so the claim keeps its name and gets `helm.sh/resource-policy: keep`. Reason (`flux-apps.md`): app-template renames a lone claim when a second is added, and `Delete` then destroys the data.
  - A SQLite app uses `strategy: Recreate`.
  - Examples with these flags: pegaprox, network-optimizer, actual-budget, influxdb.
- **Backup of PVCs.** There is no volsync. `[volume_backup]` (bucket plus key pair, needs `[postgres.backup]`) drives a nightly CronJob inside the app's own namespace (`.claude/rules/apps/volume-backup.md`, `.../network-optimizer/app/backup-cronjob.yaml.j2`).
  - Init container `snapshot` runs in the app's own pinned image: `sqlite3 ... VACUUM INTO` a copy, an `integrity_check`, an emptiness guard, then `tar -czf`, then it checks that the key files are in the tar.
  - Container `upload` runs `rustfs/rc` with the `volume-backup` Secret (endpoint host, bucket, key pair), uploads `volumes/<ns>/<ns>-<timestamp>.tar.gz`, then prunes objects older than 7 days only after a good upload. It holds no claim.
  - It mounts the app's claim read-write. The note says a second pod on the same RWO `local-path` claim is fine, because `local-path` schedules it onto the app's node.
  - Reasons given: read-only SQLite opens fail on WAL, and a plain copy of a live DB failed `integrity_check` 3 times in 12. It also says never to use BusyBox tar (it honours only the last `-C`).
  - The CronJob also needs `NET_RAW`-style init copies only for the `ping` binary; that does not apply to you.
  - Note: all CronJobs run `restricted`-compliant: `runAsNonRoot`, `automountServiceAccountToken: false`, caps dropped, `readOnlyRootFilesystem` with emptyDir work and tmp dirs.
- **CronJob pattern.** Both examples use raw `batch/v1` CronJob manifests (`kube-system/restart-reset/app/cronjob.yaml.j2`, `network-optimizer/.../backup-cronjob.yaml.j2`; the `media` Recyclarr job uses app-template instead).
  - Common settings: `concurrencyPolicy: Forbid`, `successfulJobsHistoryLimit: 1`, `failedJobsHistoryLimit: 1`, `backoffLimit` 0 to 1, `activeDeadlineSeconds` (900 and 1800), and `restartPolicy: Never`.
  - Images are pinned `tag@sha256:digest`, for example `docker.io/alpine/k8s:1.37.2@sha256:...`.
  - A failed run fires `KubeJobFailed` and stays firing until the failed Job is deleted. A CronJob that never runs fires nothing (same doc).
  - Job pods carry no `app.kubernetes.io/name` label, so an app's NetworkPolicy does not select them.
  - If your scan CronJob writes into the career-ops data root, the repo pattern is to mount the same RWO `local-path` claim; both pods land on one node. Inferred: this only works while the web pod and the CronJob never need to be on different nodes, and the claim is not RWX.

## 5. Images and secrets

- **Pinning.** Renovate handles it. Third-party images use `tag@sha256:...`, for example `ghcr.io/ozark-connect/network-optimizer:2.10.6@sha256:c4a09...`, `docker.io/rustfs/rc:v0.1.37@sha256:7e93f...`. Reactive Resume is the exception: tag only (`v6.0.10`).
- **Own-built GHCR image precedent.** The docs site. `.github/workflows/docs-image.yaml` builds `ghcr.io/jrmatherly/home-cluster/docs` for `linux/amd64`, pushes `latest` and `sha-<commit>` on main, and the Deployment pins `:latest@sha256:...`.
  - Renovate keeps the digest current (`.renovaterc.json5` rules: `pinDigests: true` in a rule without `matchUpdateTypes`, plus a digest rule that automerges).
  - The note says the GHCR package must be public, checked by hand after the first push, because the Deployment has no pull secret. A grep for `imagePullSecret|pullSecret|dockerconfigjson` over template, kubernetes and rules found nothing, so there is no pull secret anywhere. Inference: a private image would need new plumbing.
  - Manifest: `template/config/kubernetes/apps/docs/docs/app/deployment.yaml.j2`. It is a plain Deployment (not app-template) with a read-only root, `/tmp` emptyDir, probes on `/healthz`, and a NetworkPolicy. The docs namespace is unconditional.
- **Wiring a sops Secret.** Create `secret.sops.yaml.j2` (stringData from `cluster.toml`), list it in the app kustomization, and use `envFrom: - secretRef: name:` or a `secretKeyRef` in the HelmRelease env (Reactive Resume does both). Add `reloader.stakater.com/auto: "true"` so a rotated secret restarts the pod. Keep non-secret values in the HelmRelease env.
- **OAuth client secret.** Two ways in this repo:
  - In-app: `OAUTH_CLIENT_ID` in the HelmRelease env and `OAUTH_CLIENT_SECRET` in the sops Secret (Reactive Resume).
  - Gateway: a sops Secret `<app>-oidc` with key `client-secret`, referenced by `SecurityPolicy.oidc.clientSecret.name` (media, localai). One Pocket ID client carries one callback URL per route, because the policy derives `/oauth2/callback` per route.
  - Pocket ID clients are created by hand in the UI. Pocket ID shows the secret once.
- **API keys.** A random value you generate and place in `cluster.toml` (for example the media keys in `media-keys`), not created by the app.

## 6. Node facts

- **Nodes** (`talos/topf.yaml`, `docs/src/content/docs/hosts/proxmox.mdx`). 8 nodes: `k8s-cp-1`, `k8s-cp-2`, `k8s-cp-3` (control planes, tainted `NoSchedule`, CoreDNS only), `k8s-worker-1` to `k8s-worker-4`, and `k8s-gpu-1`. The proxmox doc table lists only 7 VMs (no `worker-4`), so its figures predate that node; `worker-4`'s size is unverified.
- **Architecture.** Proxmox VMs on Intel hosts, Talos `metal-amd64` ISO; docs-image builds `linux/amd64`. So the nodes are amd64. This is inferred from those files, not read from a live node.
- **Sizes** (proxmox.mdx table, dated 2026-10-03): workers 6 cores / 30 GB / 200 GB disk, gpu-1 6 cores / 40 GB (GTX 1080 passthrough, memory pinned), control planes 4 cores / 5 GB / 50 GB. The media worker is pinned by `media.node`, and `cp-3` is on the media host.
- **Resource conventions.** Requests set, memory limit only, no CPU limits (every manifest I read). Examples: network-optimizer requests 100m/512Mi, limit 2Gi; Reactive Resume requests 250m/512Mi, limit 1Gi; docs requests 10m/32Mi, limit 128Mi. A CNPG DB requests at its measured peak and limits at three times it, 512Mi minimum.
- **Chromium and Playwright.**
  - The `restricted` pod-security level means no privileged mode and no added capabilities. The Chromium sandbox needs user namespaces or `--no-sandbox`.
  - Chromium needs `/dev/shm`, so mount an emptyDir with `medium: Memory`. No manifest in the repo does this, and I found no Chromium or Playwright workload to copy.
  - Size memory limits generously. Both points are inferred from general Chromium behaviour; I tested neither.
- **Node 24.** No existing Node image to compare against.
- **Other facts.** Kubelet `maxParallelImagePulls: 3`, `imageMaximumGCAge: 168h`. There is no PodSecurity exemption mechanism for a namespace short of lowering its enforce level.

## Minimal file set for a new app, modelled on reactive-resume

Examples use a namespace and app both named `career-ops` (the name is a placeholder). Template paths are relative to `~/dev/home-cluster/`, and each has a rendered twin at the same path with `template/config/` removed and `.j2` dropped.

**Web Deployment** (`career-ops/career-ops`)
- `template/config/kubernetes/apps/career-ops/kustomization.yaml.j2`
- `template/config/kubernetes/apps/career-ops/namespace.yaml.j2` (with `restricted`, and `kustomize.toolkit.fluxcd.io/prune: disabled` as Reactive Resume does)
- `template/config/kubernetes/apps/career-ops/career-ops/ks.yaml.j2` (no CNPG `dependsOn` needed unless you add a CNPG database)
- `.../career-ops/career-ops/app/kustomization.yaml.j2`
- `.../app/ocirepository.yaml.j2` (copy of the app-template 5.3.0 pin)
- `.../app/helmrelease.yaml.j2` (controller, image `ghcr.io/...@sha256:...`, `persistence.data` with `forceRename` and `retain`, `local-path`, `Recreate`, `HTTPRoute` via `route:`)
- `.../app/secret.sops.yaml.j2` (API key and OIDC client secret)
- `.../app/networkpolicy.yaml.j2` (admit the `network` namespace only)
- `.../app/securitypolicy.yaml.j2` (gateway OIDC, copied from `media/shared`, with `targetRefs` to your route)
- `.../app/oidc-secret.sops.yaml.j2` (`client-secret` key)

**Scheduled scans:** `.../app/scan-cronjob.yaml.j2` (raw CronJob modelled on `network-optimizer/.../backup-cronjob.yaml.j2`; mount the same claim).

**Publish service with its own sqlite volume:** a second controller in the same HelmRelease, or a separate app folder `.../publish/{ks.yaml.j2, app/...}` with its own `persistence` claim (`forceRename` plus `retain`) and `Recreate`. A separate folder means its own Flux Kustomization and its own `ocirepository`.

**Optional backups:** `volume-backup`-style CronJob and `backup-secret.sops.yaml.j2` per sqlite claim (needs `[volume_backup]` and `sqlite3` plus GNU tar in the image).

**Validator, sample, rules, fixtures**
- `template/scripts/validate.py` (new model class, a `<name>_enabled` computed property, `_all_or_none` on the secret group, cross-field rules for `pocket_id` and `ingress.mode`)
- `cluster.sample.toml` (new banner block in the sample's section position, plus `just template scaffold <section>` for `cluster.toml`)
- `cluster.schema.json` (generated by `just template schema`)
- `.github/template-tests/valid/public.toml` and an invalid fixture with `# expect:`, plus the `validate-valid` / `validate-invalid` matrix in `.github/workflows/template-e2e.yaml`
- `.claude/rules/apps/career-ops.md` and the index line in `CLAUDE.md`
- If you build the image yourself: a `.github/workflows/*-image.yaml` modelled on `docs-image.yaml`, a public GHCR package, and a Renovate rule like the docs one in `.renovaterc.json5`

**Likely `cluster.toml` fields** (`[career_ops]`; the names are my guess, not from the repo)
- `session_secret` (the enable switch, like `auth_secret`)
- `oidc_client_id` and `oidc_client_secret` (Pocket ID client created by hand, with one callback URL per route)
- an API key field for the publish service
- `public_hostname` and `internal_hostname`, or derive them from `domain.name` (the Reactive Resume code hardcodes `resume.${SECRET_DOMAIN}` in the template)
- a `public` boolean if the route should also be on `envoy-external`, as `media.public` does
- cross-field requirements: `pocket_id_enabled` and `ingress.mode != "none"`, plus `volume_backup_enabled` only if you want the nightly sqlite tar

**Not checked:** how Flux treats an empty rendered `kustomization.yaml`; whether `worker-4` matches the other workers; how Hubble's SecurityPolicy differs from the media one; any Chromium or Playwright workload (none found); anything in `kubernetes/` that I did not list because a few `ls` results were filtered by the tool.
