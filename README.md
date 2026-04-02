# Utility Usage Dashboard

Personal portfolio project: a small **React** dashboard for **Green Button / ESPI** utility XML (e.g. gas non-interval usage). The browser parses XML client-side; an optional **Node (Express)** API stores uploaded summaries in a JSON file inside the pod so all browsers see the same data. **Terraform** provisions **Kubernetes** Deployment, Service, Ingress, and an optional basic-auth-style login via env vars.

## Features

- Drop an `EGD_Gas_EnergyUsage_*.xml` file (or compatible ESPI XML); charts for monthly use, bill trend, cost breakdown, billing history
- **DEV / PROD** environment badge and **version** from the server when the API is available
- Optional **login**: set `DASHBOARD_USER` and `DASHBOARD_PASSWORD` in the container (Terraform → Kubernetes secret) for an HttpOnly session cookie under `/gas-dashboard`
- For local demos, add your own XML under [`sample_files/`](sample_files/) (ignored by git; see that folder’s README)

## Stack

React 18, Vite 6, Recharts, Express, Docker (`node:20-alpine`), Terraform Kubernetes provider, Traefik ingress class (see note below)

## Quick start (local)

```bash
git clone <your-repo-url>
cd <clone-directory>
npm install
npm run dev
```

Open http://localhost:5173/ and load an XML file (drop a Green Button XML or use files under `sample_files/` on your machine).

**Production server locally** (built SPA + API, same as the container). The process defaults to **port 80** to match Kubernetes; on a workstation that often conflicts with other services or requires elevated privileges, so use an unprivileged port:

```bash
npm run build
PORT=8080 DASHBOARD_USER=admin DASHBOARD_PASSWORD=secret npm start
```

Then open http://localhost:8080/gas-dashboard/ .

Without `DASHBOARD_USER` / `DASHBOARD_PASSWORD`, auth is off and the same URL still works.

## Deploy prerequisites

- [Terraform](https://www.terraform.io/) `>= 1.0`
- `kubectl` configured; context name must match `kube_context` in your tfvars
- A Kubernetes cluster with the **ingress class name** this module expects: **`traefik`** (`ingress_class_name` in [`terraform/main.tf`](terraform/main.tf)). If you use nginx, Istio, or another ingress controller, change that resource before apply.
- **Docker** (or another registry flow) if the cluster pulls from a registry

## Terraform setup

Use **only** the **`dev`** and **`prod`** workspaces for this stack, not **`default`**. See [`terraform/WORKSPACES.md`](terraform/WORKSPACES.md).

```bash
cd terraform
cp dev.tfvars.example dev.tfvars
cp prod.tfvars.example prod.tfvars
# Edit dev.tfvars / prod.tfvars: kube_context, gateway_host, image (registry your cluster can pull), strong passwords, etc.

terraform init
terraform workspace new dev 2>/dev/null || true
terraform workspace new prod 2>/dev/null || true
terraform workspace select dev
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

`terraform plan` / `apply` need a working **kubectl** context (see `kube_context` in tfvars) and a reachable cluster.

Validate after deploy (replace host with `gateway_host` from tfvars):

```bash
curl -s "http://YOUR_GATEWAY/gas-dashboard/api/environment"
```

In Kubernetes you should see `environment` matching tfvars and **`version`** when the image tag is set (Terraform passes `APP_IMAGE_VERSION`). On a local `npm start` without that env var, the response is typically `{"environment":"local"}` with no `version` field.

## Build, push registry, apply (script)

From the repository root, with Docker running. Create **`terraform/dev.tfvars`** (and **`prod.tfvars`** if you deploy prod) from the `.example` files first; the script updates the `image` line and runs Terraform.

```bash
export DOCKERHUB_USER=yourregistryuser
# Optional: match your kubectl contexts and print useful URLs
export KUBE_CONTEXT_DEV=homelab-dev
export KUBE_CONTEXT_PROD=homelab-prod
export DEPLOY_URL_DEV="http://10.0.0.1/gas-dashboard/"
export DEPLOY_URL_PROD="http://10.0.0.2/gas-dashboard/"

./scripts/push-and-deploy.sh yourregistryuser dev
./scripts/push-and-deploy.sh yourregistryuser prod
./scripts/push-and-deploy.sh yourregistryuser both
```

Image tag defaults to **`version`** in [`package.json`](package.json). Override with `IMAGE_TAG=1.2.3-rc.1`. Reuse a local build with `SKIP_BUILD=1`.

**Rollback:** set `image` in the tfvars to a previous registry tag, then `terraform apply` on that workspace.

Offline / air-gapped nodes: see [`terraform/README-DEPLOY.md`](terraform/README-DEPLOY.md).

## Security

- **Never commit** `dev.tfvars`, `prod.tfvars`, or Terraform **state**; examples use `*.tfvars.example` only.
- CI runs `npm audit --audit-level=high` and **Trivy** on the Docker image (`CRITICAL`, `HIGH`). Run Dependabot PRs promptly.
- Replace placeholder passwords before any shared or production cluster.

## License

[MIT](LICENSE)
