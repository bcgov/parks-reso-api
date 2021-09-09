terraform {
  source = "../src"
}

include {
  path = find_in_parent_folders()
}

locals {
  app_version = get_env("app_version", "")
  s3_bucket = get_env("s3_bucket", "")
  db_name = get_env("db_name", "")
  gc_notify_api_path = get_env("gc_notify_api_path", "")
  gc_notify_api_key = get_env("gc_notify_api_key", "")
  gc_notify_parking_receipt_template_id = get_env("gc_notify_parking_receipt_template_id", "")
  gc_notify_trail_receipt_template_id = get_env("gc_notify_trail_receipt_template_id", "")
  gc_notify_cancel_template_id = get_env("gc_notify_cancel_template_id", "")
  pass_cancellation_route = get_env("pass_cancellation_route", "")
  public_url = get_env("public_url", "")
}

generate "dev_tfvars" {
  path              = "dev.auto.tfvars"
  if_exists         = "overwrite"
  disable_signature = true
  contents          = <<-EOF
app_version = "${local.app_version}"
s3_bucket = "${local.s3_bucket}"
db_name = "${local.db_name}"
gc_notify_api_path = "${local.gc_notify_api_path}"
gc_notify_api_key = "${local.gc_notify_api_key}"
gc_notify_parking_receipt_template_id = "${local.gc_notify_parking_receipt_template_id}"
gc_notify_trail_receipt_template_id = "${local.gc_notify_trail_receipt_template_id}"
gc_notify_cancel_template_id = "${local.gc_notify_cancel_template_id}"
public_url = "${local.public_url}"
EOF
}
