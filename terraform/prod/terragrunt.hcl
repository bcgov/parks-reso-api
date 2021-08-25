terraform {
  source = "../../tf-lambda"
}

include {
  path = find_in_parent_folders()
}

locals {
  app_version = get_env("app_version", "")
}

generate "prod_tfvars" {
  path              = "prod.auto.tfvars"
  if_exists         = "overwrite"
  disable_signature = true
  contents          = <<-EOF
app_version = "${local.app_version}"
EOF
}