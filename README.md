# Utility Usage Dashboard

Personal portfolio project: a small **React** dashboard for **Green Button / ESPI** utility XML (e.g. gas non-interval usage). The browser parses XML client-side; an optional **Node (Express)** API stores uploaded summaries in a JSON file inside the pod so all browsers see the same data. **Terraform** provisions **Kubernetes** Deployment, Service, Ingress, and an optional basic-auth-style login via env vars.

## Features

- Drop an `EGD_Gas_EnergyUsage_*.xml` file (or compatible ESPI XML); charts for monthly use, bill trend, cost breakdown, billing history
- **DEV / PROD** environment badge and **version** from the server when the API is available
- Optional **login**: set `DASHBOARD_USER` and `DASHBOARD_PASSWORD` in the container (Terraform → Kubernetes secret) for an HttpOnly session cookie under `/gas-dashboard`
- For local demos, add your own XML under [`sample_files/`](sample_files/) (ignored by git; see that folder’s README)

## Stack

React 18, Vite 5, Recharts, Express, Docker (`node:20-alpine`), Terraform Kubernetes provider, Traefik ingress class (see note below)

## Quick start (local)

```bash
git clone <your-repo-url>
cd <clone-directory>
npm install
npm run dev
```

Open http://localhost:5173 and load an XML file.

**Auth off locally** unless you run the production server:

```bash
npm run build
DASHBOARD_USER=admin DASHBOARD_PASSWORD=secret npm start
```

Then open http://localhost:80/gas-dashboard/ (or map another host port to the container).

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
# Edit dev.tfvars / prod.tfvars: kube_context, gateway_host, image, strong passwords, etc.

terraform init
terraform workspace new dev 2>/dev/null || true
terraform workspace new prod 2>/dev/null || true
terraform workspace select dev
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

Validate after deploy:

```bash
curl -s "http://YOUR_GATEWAY/gas-dashboard/api/environment"
# e.g. {"environment":"dev","version":"1.0.0"}
```

## Build, push registry, apply (script)

From the repository root, with Docker running:

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
