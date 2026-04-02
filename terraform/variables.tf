variable "kube_context" {
  description = "kubectl context (e.g. homelab-dev)."
  type        = string
}

variable "environment" {
  description = "Deployment label for UI badge (dev | prod). Passed to pod as DEPLOY_ENV."
  type        = string
  default     = "dev"
}

variable "gateway_host" {
  description = "Cluster IP for browser (e.g. dev VM IP)."
  type        = string
}

variable "ingress_path_prefix" {
  description = "URL path for this app (e.g. utility-usage-dashboard)."
  type        = string
  default     = "gas-dashboard"
}

variable "namespace" {
  description = "Kubernetes namespace for the app (created if missing)."
  type        = string
  default     = "utility"
}

variable "app_name" {
  type    = string
  default = "utility-usage-dashboard"
}

variable "image" {
  description = "Full image ref registry/repo:tag. Prefer immutable tags (not only :latest) so rollbacks are a tfvars change + apply."
  type        = string
  default     = "utility-usage-dashboard:latest"
}

variable "app_version" {
  description = "Version string shown in the UI (should match the image tag). Leave empty to use the segment after the last ':' in var.image."
  type        = string
  default     = ""
}

variable "image_pull_policy" {
  type    = string
  default = "IfNotPresent"
}

variable "dashboard_username" {
  description = "Login username for the dashboard UI (stored in a Kubernetes secret)."
  type        = string
  default     = "admin"
}

variable "dashboard_password" {
  description = "Login password for the dashboard UI. Override in tfvars; use strong values in prod."
  type        = string
  sensitive   = true
  default     = "changeme"
}
