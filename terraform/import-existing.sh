#!/usr/bin/env bash
# One-time: bind existing cluster objects into the current Terraform workspace state.
# Use when you created workspace "dev" or "prod" with empty state but the app already exists
# (e.g. you previously applied in the "default" workspace).
#
# Usage:
#   cd terraform
#   terraform workspace select dev   # or: terraform workspace new dev
#   ./import-existing.sh dev.tfvars
#
#   terraform workspace select prod
#   ./import-existing.sh prod.tfvars

set -euo pipefail
VARFILE="${1:-dev.tfvars}"
if [ ! -f "$VARFILE" ]; then
  echo "Usage: $0 <var-file>  (e.g. dev.tfvars or prod.tfvars)"
  exit 1
fi

NS="utility"
APP="utility-usage-dashboard"
if grep -qE '^namespace\s*=' "$VARFILE"; then
  NS=$(grep -E '^namespace\s*=' "$VARFILE" | head -1 | sed -E 's/^namespace[[:space:]]*=[[:space:]]*"([^"]*)".*/\1/')
fi
if grep -qE '^app_name\s*=' "$VARFILE"; then
  APP=$(grep -E '^app_name\s*=' "$VARFILE" | head -1 | sed -E 's/^app_name[[:space:]]*=[[:space:]]*"([^"]*)".*/\1/')
fi

echo "Current workspace: $(terraform workspace show)"
echo "Importing -var-file=$VARFILE  namespace=$NS  deployment/service/ingress=$APP"
terraform import -var-file="$VARFILE" kubernetes_namespace.app "$NS"
terraform import -var-file="$VARFILE" kubernetes_deployment.app "${NS}/${APP}"
terraform import -var-file="$VARFILE" kubernetes_service_v1.app "${NS}/${APP}"
terraform import -var-file="$VARFILE" kubernetes_ingress_v1.app "${NS}/${APP}"
echo "Done. Run: terraform plan -var-file=$VARFILE && terraform apply -var-file=$VARFILE"
