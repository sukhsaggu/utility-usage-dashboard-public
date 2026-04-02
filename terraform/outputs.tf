output "url" {
  value = "http://${var.gateway_host}/${var.ingress_path_prefix}"
}

output "context" {
  value = var.kube_context
}
