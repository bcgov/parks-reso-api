data "aws_ssm_parameter" "db_name" {
  name = "/parks-reso-api/db-name"
}

data "aws_ssm_parameter" "meta_db_name" {
  name = "/parks-reso-api/meta-db-name"
}

data "aws_ssm_parameter" "pass_shortdate_index" {
  name = "/parks-reso-api/pass-shortdate-index"
}

data "aws_ssm_parameter" "rc_alert_webhook_url" {
  name = "/parks-reso-api/rc-alert-webhook-url"
}

data "aws_ssm_parameter" "rc_alert_webhook_token" {
  name = "/parks-reso-api/rc-alert-webhook-token"
}

data "aws_ssm_parameter" "gc_notify_api_bulk_path" {
  name = "/parks-reso-api/gc-notify-api-bulk-path"
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

data "aws_ssm_parameter" "gc_notify_reminder_template_id" {
  name = "/parks-reso-api/gc-notify-reminder-template-id"
}

data "aws_ssm_parameter" "gc_notify_survey_template_id" {
  name = "/parks-reso-api/gc-notify-survey-template-id"
}

data "aws_ssm_parameter" "gc_notify_is_sending_reminders" {
  name = "/parks-reso-api/gc-notify-is-sending-reminders"
}

data "aws_ssm_parameter" "gc_notify_is_sending_surveys" {
  name = "/parks-reso-api/gc-notify-is-sending-surveys"
}

data "aws_ssm_parameter" "feedback_survey_url" {
  name = "/parks-reso-api/feedback-survey-url"
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

data "aws_ssm_parameter" "admin_url" {
  name = "/parks-reso-admin/url"
}

data "aws_ssm_parameter" "pass_manage_path" {
  name = "/parks-reso-api/pass-manage-path"
}

data "aws_ssm_parameter" "qr_code_enabled" {
  name = "/parks-reso-api/qr_code_enabled"
}

data "aws_ssm_parameter" "aws_account_list" {
  name = "/parks-reso-api/aws_account_list"
}

data "aws_ssm_parameter" "rocketchat_url" {
  name = "/parks-reso-api/rocketchat_url"
}

data "aws_ssm_parameter" "rocketchat_bearer_token" {
  name = "/parks-reso-api/rocketchat_bearer_token"
}

data "aws_ssm_parameter" "sso_issuer" {
  name = "/parks-reso-api/sso-issuer"
}

data "aws_ssm_parameter" "sso_jwksuri" {
  name = "/parks-reso-api/sso-jwksuri"
}