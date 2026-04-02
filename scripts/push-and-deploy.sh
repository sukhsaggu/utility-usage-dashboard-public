#!/usr/bin/env bash
# Push image to Docker Hub and apply Terraform (dev, prod, or both).
#
# Usage:
#   DOCKERHUB_USER=yourusername ./scripts/push-and-deploy.sh [dev|prod|both]
#   ./scripts/push-and-deploy.sh yourusername [dev|prod|both]
#
# Default target is dev. Use "both" to deploy dev then prod (separate Terraform workspaces).
#
# Image tags (semantic versioning):
#   Default tag is package.json "version" (e.g. 1.2.3). Bump it before each release you want to track.
#   Also pushes :latest. Terraform writes the semver tag into tfvars for rollback (pin image = user/repo:1.2.2).
#
# Environment:
#   IMAGE_TAG              — override tag (e.g. 1.2.4-rc.1) instead of package.json version
#   SKIP_BUILD             — set to 1 to reuse existing local utility-usage-dashboard:latest (still retagged & pushed)
#   KUBE_CONTEXT_DEV       — kubectl context for dev (default: homelab-dev)
#   KUBE_CONTEXT_PROD      — kubectl context for prod (default: homelab-prod)
#   DEPLOY_URL_DEV         — optional hint printed after dev deploy (e.g. http://10.0.0.1/gas-dashboard/)
#   DEPLOY_URL_PROD        — optional hint printed after prod deploy

set -e
TARGET="${TARGET:-dev}"
if [ -n "$2" ]; then
  DOCKERHUB_USER="${DOCKERHUB_USER:-$1}"
  TARGET="$2"
elif [ -n "$1" ] && [[ "$1" =~ ^(dev|prod|both)$ ]]; then
  TARGET="$1"
  DOCKERHUB_USER="${DOCKERHUB_USER}"
else
  DOCKERHUB_USER="${DOCKERHUB_USER:-$1}"
fi

if [ -z "$DOCKERHUB_USER" ]; then
  echo "Usage: DOCKERHUB_USER=yourusername $0 [dev|prod|both]"
  echo "   Or: $0 yourusername [dev|prod|both]"
  echo "   Default target: dev. Use both to deploy dev then prod."
  exit 1
fi

case "$TARGET" in
  dev|prod|both) ;;
  *)
    echo "Unknown target: $TARGET (use dev, prod, or both)"
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TERRAFORM_DIR="$ROOT_DIR/terraform"

KUBE_CONTEXT_DEV="${KUBE_CONTEXT_DEV:-homelab-dev}"
KUBE_CONTEXT_PROD="${KUBE_CONTEXT_PROD:-homelab-prod}"

resolve_image_tag() {
  if [ -n "${IMAGE_TAG:-}" ]; then
    printf '%s' "$IMAGE_TAG"
    return
  fi
  local ver
  ver="$(cd "$ROOT_DIR" && node -p "String(require('./package.json').version || '').trim()" 2>/dev/null || true)"
  if [ -z "$ver" ]; then
    echo "ERROR: could not read version from $ROOT_DIR/package.json"
    exit 1
  fi
  if ! printf '%s' "$ver" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'; then
    echo "ERROR: package.json version must be semver (e.g. 1.2.3 or 1.0.0-rc.1), got: $ver"
    exit 1
  fi
  printf '%s' "$ver"
}

read_ns_app() {
  local tfvars_rel="$1"
  local path="$TERRAFORM_DIR/$tfvars_rel"
  local NS="utility"
  local APP="utility-usage-dashboard"
  if [ -f "$path" ] && grep -qE '^namespace\s*=' "$path"; then
    NS="$(grep -E '^namespace\s*=' "$path" | head -1 | sed -E 's/^namespace[[:space:]]*=[[:space:]]*"([^"]*)".*/\1/')"
  fi
  if [ -f "$path" ] && grep -qE '^app_name\s*=' "$path"; then
    APP="$(grep -E '^app_name\s*=' "$path" | head -1 | sed -E 's/^app_name[[:space:]]*=[[:space:]]*"([^"]*)".*/\1/')"
  fi
  printf '%s %s' "$NS" "$APP"
}

TAG="$(resolve_image_tag)"
IMAGE_REF="${DOCKERHUB_USER}/utility-usage-dashboard:${TAG}"
LATEST_REF="${DOCKERHUB_USER}/utility-usage-dashboard:latest"

if [ "${SKIP_BUILD:-}" = "1" ]; then
  echo "SKIP_BUILD=1: using existing local image utility-usage-dashboard:latest"
else
  echo "Building image from $ROOT_DIR ..."
  docker build -t utility-usage-dashboard:latest "$ROOT_DIR"
fi

echo "Tag: $TAG"
echo "Pushing $IMAGE_REF and $LATEST_REF (same digest)"
docker tag utility-usage-dashboard:latest "$IMAGE_REF"
docker tag utility-usage-dashboard:latest "$LATEST_REF"
docker push "$IMAGE_REF"
docker push "$LATEST_REF"

update_tfvars_image() {
  local f="$1"
  local img="$2"
  local path="$TERRAFORM_DIR/$f"
  if [ ! -f "$path" ]; then
    echo "WARN: missing $path — create from ${f}.example"
    return
  fi
  sed -i.bak "s|^image *=.*|image               = \"$img\"|" "$path"
  sed -i.bak 's|^image_pull_policy *=.*|image_pull_policy   = "Always"|' "$path"
  rm -f "$path.bak"
  echo "Updated $f → image = $img"
}

case "$TARGET" in
  dev)  update_tfvars_image dev.tfvars "$IMAGE_REF" ;;
  prod) update_tfvars_image prod.tfvars "$IMAGE_REF" ;;
  both)
    update_tfvars_image dev.tfvars "$IMAGE_REF"
    update_tfvars_image prod.tfvars "$IMAGE_REF"
    ;;
esac

cd "$TERRAFORM_DIR"

ensure_workspace() {
  local w="$1"
  if ! terraform workspace select "$w" 2>/dev/null; then
    terraform workspace new "$w"
  fi
  local active
  active="$(terraform workspace show)"
  if [ "$active" != "$w" ]; then
    echo "ERROR: expected Terraform workspace '$w' but active workspace is '$active'"
    exit 1
  fi
}

apply_and_rollout() {
  local ws="$1"
  local tfvars="$2"
  local ctx="$3"
  read -r ns app <<<"$(read_ns_app "$tfvars")"
  echo "=== Workspace: $ws ($tfvars, kubectl context $ctx) ==="
  ensure_workspace "$ws"
  terraform apply -var-file="$tfvars" -auto-approve -lock=false
  echo "Restarting deployment on $ctx (namespace=$ns deployment=$app)..."
  kubectl --context "$ctx" rollout restart "deployment/$app" -n "$ns"
  kubectl --context "$ctx" rollout status "deployment/$app" -n "$ns" --timeout=120s
}

hint_url() {
  local url="$1"
  if [ -n "$url" ]; then
    echo "Open: $url"
  else
    echo "Open: http://<gateway_host>/<ingress_path_prefix>/ (see your .tfvars gateway_host and ingress_path_prefix)"
  fi
}

case "$TARGET" in
  dev)
    apply_and_rollout dev dev.tfvars "$KUBE_CONTEXT_DEV"
    echo -n "Done (dev). "
    hint_url "${DEPLOY_URL_DEV:-}"
    ;;
  prod)
    apply_and_rollout prod prod.tfvars "$KUBE_CONTEXT_PROD"
    echo -n "Done (prod). "
    hint_url "${DEPLOY_URL_PROD:-}"
    ;;
  both)
    apply_and_rollout dev dev.tfvars "$KUBE_CONTEXT_DEV"
    apply_and_rollout prod prod.tfvars "$KUBE_CONTEXT_PROD"
    echo "Done (dev + prod)."
    hint_url "${DEPLOY_URL_DEV:-}"
    hint_url "${DEPLOY_URL_PROD:-}"
    ;;
esac

echo ""
echo "Deployed image: $IMAGE_REF"
echo "Next release: bump \"version\" in package.json (semver), then deploy again."
echo "Rollback: set image in the relevant .tfvars to a previous tag, then terraform apply for that workspace."
