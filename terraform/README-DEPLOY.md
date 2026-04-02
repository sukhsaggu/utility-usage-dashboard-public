# Deploy to Kubernetes without a registry on the node

If your cluster nodes **cannot** pull images from your laptop or from the internet, load the image on the node (e.g. k3s) over SSH.

## Option A: Load image on the node (SSH)

1. **On your build machine** — build and save the image:

   ```bash
   docker build -t utility-usage-dashboard:latest .
   docker save utility-usage-dashboard:latest -o /tmp/utility-usage-dashboard.tar
   scp /tmp/utility-usage-dashboard.tar YOUR_NODE:/tmp/
   ```

2. **On the node** (SSH in, then — adjust for your container runtime):

   ```bash
   # k3s example
   sudo k3s ctr images import /tmp/utility-usage-dashboard.tar
   rm /tmp/utility-usage-dashboard.tar
   ```

3. **Apply Terraform** (use the **dev** workspace so prod state stays separate):

   ```bash
   cd terraform
   terraform workspace select dev 2>/dev/null || terraform workspace new dev
   terraform apply -var-file=dev.tfvars -auto-approve
   ```

   In `dev.tfvars`, set `image` to a name the node already has (often `utility-usage-dashboard:latest`) and `image_pull_policy = "IfNotPresent"` or `"Never"` as appropriate.

4. Restart the deployment so the pod picks up the image:

   ```bash
   kubectl --context YOUR_CONTEXT rollout restart deployment/utility-usage-dashboard -n utility
   ```

## Option B: Push to a container registry

1. Tag and push:

   ```bash
   docker tag utility-usage-dashboard:latest YOUR_REGISTRY/utility-usage-dashboard:latest
   docker push YOUR_REGISTRY/utility-usage-dashboard:latest
   ```

2. In `dev.tfvars`, set:

   ```hcl
   image               = "YOUR_REGISTRY/utility-usage-dashboard:latest"
   image_pull_policy   = "Always"
   ```

3. Apply and restart if needed:

   ```bash
   cd terraform
   terraform apply -var-file=dev.tfvars -auto-approve
   kubectl rollout restart deployment/utility-usage-dashboard -n utility
   ```

## URL

After the pod is running: **`http://<gateway_host>/<ingress_path_prefix>/`** — both values come from your `.tfvars` (defaults: path `gas-dashboard`). See the main [README.md](../README.md) for workspaces and `prod.tfvars`.
