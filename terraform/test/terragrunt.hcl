terraform {
  source = "../src"
}

include {
  path = find_in_parent_folders()
}

locals {
  app_version = get_env("app_version", "")
  s3_bucket = get_env("s3_bucket", "")
  target_env = get_env("target_env", "")
}

generate "test_tfvars" {
  path              = "test.auto.tfvars"
  if_exists         = "overwrite"
  disable_signature = true
  contents          = <<-EOF
app_version = "${local.app_version}"
s3_bucket = "${local.s3_bucket}"
target_env = "${local.target_env}"
EOF
}
