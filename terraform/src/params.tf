data "aws_ssm_parameter" "db_name" {
  name = "/parks-reso-api/db-name"
}

data "aws_ssm_parameter" "gc_notify_api_path" {
  name = "/parks-reso-api/gc-notify-api-path"
}

data "aws_ssm_parameter" "gc_notify_api_key" {
  name = "/parks-reso-api/gc-notify-api-key"
}

data "aws_ssm_parameter" "gc_notify_parking_receipt_template_id" {
  name = "/parks-reso-api/gc-notify-parking-receipt-template-id"
}

data "aws_ssm_parameter" "gc_notify_trail_receipt_template_id" {
  name = "/parks-reso-api/gc-notify-trail-receipt-template-id"
}

data "aws_ssm_parameter" "gc_notify_cancel_template_id" {
  name = "/parks-reso-api/gc-notify-cancel-template-id"
}

data "aws_ssm_parameter" "pass_cancellation_route" {
  name = "/parks-reso-api/pass-cancellation-route"
}

data "aws_ssm_parameter" "s3_bucket_data" {
  name = "/parks-reso-api/s3-bucket-data"
}

data "aws_ssm_parameter" "public_url" {
  name = "/parks-reso-public/url"
}
