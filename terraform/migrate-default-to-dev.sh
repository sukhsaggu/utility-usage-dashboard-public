#!/usr/bin/env bash
# Copy Terraform state from workspace "default" into workspace "dev" (one-time migration).
# Use when all dashboard resources were managed from the default workspace and you want
# to standardize on dev/prod workspaces only.
#
# Prerequisites: run from terraform/, default workspace has the real state.
#
# Usage: ./migrate-default-to-dev.sh

set -euo pipefail
cd "$(dirname "$0")"

if ! terraform workspace select default 2>/dev/null; then
  echo "No 'default' workspace or cannot select it."
  exit 1
fi

RESOURCES=$(terraform state list 2>/dev/null | wc -l | tr -d ' ')
if [ "${RESOURCES:-0}" -eq 0 ]; then
  echo "Workspace 'default' has no resources in state. Nothing to migrate."
  exit 1
fi

echo "Found $RESOURCES resource(s) in workspace 'default'."
echo "This will REPLACE state in workspace 'dev' with a copy of 'default'."
echo "Afterwards use only 'dev' / 'prod' for this project (see WORKSPACES.md)."
read -r -p "Continue? [y/N] " ok
if [[ ! "${ok}" =~ ^[yY]$ ]]; then
  echo "Aborted."
  exit 1
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
terraform state pull > "$TMP"

if terraform workspace select dev 2>/dev/null; then
  :
else
  terraform workspace new dev
fi

terraform state push -force "$TMP"

echo ""
echo "Migration complete. Active workspace: $(terraform workspace show)"
echo "Next: terraform plan -var-file=dev.tfvars"
echo "Tip: Avoid future applies on 'default' for this directory; use 'dev' or 'prod' only."
