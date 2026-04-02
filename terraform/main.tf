# Utility usage dashboard (JSX) — Node serves SPA + API.
# Terraform: use workspaces dev + prod only (see terraform/WORKSPACES.md). Do not manage this stack from workspace "default".

locals {
  # Last ":" segment matches docker tags for host:port/repo:tag refs (e.g. v1, 20260401-120000-abc).
  image_version_label = trimspace(var.app_version) != "" ? trimspace(var.app_version) : element(reverse(split(":", var.image)), 0)
}

resource "kubernetes_namespace" "app" {
  metadata {
    name = var.namespace
  }
}

resource "kubernetes_secret" "dashboard_auth" {
  metadata {
    name      = "${var.app_name}-auth"
    namespace = kubernetes_namespace.app.metadata[0].name
  }
  # Plain strings: provider base64-encodes for the API once (do not use base64encode() here).
  data = {
    DASHBOARD_USER     = var.dashboard_username
    DASHBOARD_PASSWORD = var.dashboard_password
  }
  type       = "Opaque"
  depends_on = [kubernetes_namespace.app]
}

resource "kubernetes_deployment" "app" {
  wait_for_rollout = false
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace.app.metadata[0].name
    labels    = { app = var.app_name }
  }
  spec {
    replicas = 1
    selector {
      match_labels = { app = var.app_name }
    }
    template {
      metadata {
        labels = { app = var.app_name }
      }
      spec {
        container {
          name              = "app"
          image             = var.image
          image_pull_policy  = var.image_pull_policy
          env_from {
            secret_ref {
              name = kubernetes_secret.dashboard_auth.metadata[0].name
            }
          }
          env {
            name  = "DEPLOY_ENV"
            value = var.environment
          }
          env {
            name  = "APP_IMAGE_VERSION"
            value = local.image_version_label
          }
          port {
            container_port = 80
          }
          volume_mount {
            name       = "dashboard-data"
            mount_path = "/data"
          }
          resources {
            requests = { memory = "64Mi", cpu = "50m" }
            limits   = { memory = "128Mi", cpu = "200m" }
          }
        }
        volume {
          name = "dashboard-data"
          empty_dir {}
        }
      }
    }
  }
  depends_on = [kubernetes_namespace.app, kubernetes_secret.dashboard_auth]
}

resource "kubernetes_service_v1" "app" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_deployment.app.metadata[0].namespace
  }
  spec {
    selector = { app = var.app_name }
    port {
      port        = 80
      target_port = 80
      name        = "http"
    }
  }
  depends_on = [kubernetes_deployment.app]
}

resource "kubernetes_ingress_v1" "app" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_deployment.app.metadata[0].namespace
  }
  spec {
    ingress_class_name = "traefik"
    rule {
      http {
        path {
          path      = "/${var.ingress_path_prefix}"
          path_type = "Prefix"
          backend {
            service {
              name = kubernetes_service_v1.app.metadata[0].name
              port { number = 80 }
            }
          }
        }
      }
    }
  }
  depends_on = [kubernetes_service_v1.app]
}
