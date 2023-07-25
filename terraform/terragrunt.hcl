locals {
  tfc_hostname     = "app.terraform.io"
  tfc_organization = "bcgov"
  project          = "pil3ef"
  environment      = reverse(split("/", get_terragrunt_dir()))[0]
  aws_region       = get_env("AWS_REGION")
}

generate "remote_state" {
  path      = "backend.tf"
  if_exists = "overwrite"
  contents  = <<EOF
terraform {
  backend "s3" {
    bucket         = "terraform-remote-state-${local.project}-${local.environment}"
    key            = "remote.tfstate-api"                              # Path and name of the state file within the bucket
    region         = "ca-central-1"                                      # AWS region where the bucket is located
    dynamodb_table = "terraform-remote-state-lock-${local.project}"      # Replace with either generated or custom DynamoDB table name
    encrypt        = true                                                # Enable encryption for the state file
  }
}
EOF
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite"
  contents  = <<EOF
provider "aws" {
  region  = var.aws_region
}
EOF
}

generate "common_vars" {
  path              = "common.auto.tfvars"
  if_exists         = "overwrite"
  disable_signature = true
  contents          = <<-EOF
aws_region = "${local.aws_region}"
EOF
}
