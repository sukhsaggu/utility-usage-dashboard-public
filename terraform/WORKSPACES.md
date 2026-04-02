# Terraform workspaces (required)

This stack **must** use two workspaces so dev and prod state never overwrite each other.

| Workspace | Var file        | Typical kubectl context | App URL pattern |
|-----------|-----------------|-------------------------|------------------|
| **dev**   | `dev.tfvars`    | (your dev context)      | `http://GATEWAY/gas-dashboard/` |
| **prod**  | `prod.tfvars`   | (your prod context)     | `http://GATEWAY/gas-dashboard/` |

Replace `GATEWAY` with the `gateway_host` value from your `.tfvars` (IP or DNS of the ingress / load balancer you use in front of the cluster).

Create local var files from the examples (they are gitignored):

```bash
cp dev.tfvars.example dev.tfvars
cp prod.tfvars.example prod.tfvars
```

## Rules

1. **Do not** run `terraform apply` for this app on the **`default`** workspace. If old state still lives there, migrate it (below) or you risk duplicate creates / drift.
2. **Always** `terraform workspace select dev` or `prod` before manual `plan` / `apply`.
3. **`scripts/push-and-deploy.sh`** selects `dev`, `prod`, or both automatically; you do not need to switch workspaces by hand when using the script.

## Container image tags

Deploys use **semver tags** from `package.json` (`version`) in `dev.tfvars` / `prod.tfvars` (plus `:latest`) so you can roll back by pinning `image` to an older version and running `terraform apply` on the right workspace. See the repository **README** for `IMAGE_TAG`, `SKIP_BUILD`, and examples.

## First-time setup

```bash
cd terraform
terraform init
terraform workspace new dev   # ignore error if it exists
terraform workspace new prod  # ignore error if it exists
```

## Migrating old state from `default` into `dev`

If you previously applied only in **`default`** and the dev cluster already has the app:

**Option A — copy state** (keeps one snapshot; run once):

```bash
cd terraform
./migrate-default-to-dev.sh
terraform plan -var-file=dev.tfvars
```

**Option B — import** (empty `dev` workspace, objects already on cluster):

```bash
terraform workspace select dev
./import-existing.sh dev.tfvars
terraform apply -var-file=dev.tfvars
```

## After migration

Use **`terraform workspace show`** and confirm it says `dev` or `prod` before changing infrastructure. Optionally clear resource tracking from **`default`** only if you understand the impact (`terraform workspace select default` then `terraform state rm …` for each address, or leave `default` unused).
