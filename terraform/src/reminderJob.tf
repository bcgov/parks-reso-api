resource "aws_lambda_function" "send_reminder" {
  function_name = "sendReminder${var.env_identifier}"

  filename         = "artifacts/sendReminder.zip"
  source_code_hash = filebase64sha256("artifacts/sendReminder.zip")

  handler = "lambda/sendReminder/index.handler"
  runtime = "nodejs14.x"
  timeout = 300
  publish = "true"

  environment {
    variables = {
      TABLE_NAME                     = data.aws_ssm_parameter.db_name.value,
      META_TABLE_NAME                = data.aws_ssm_parameter.meta_db_name.value,
      PUBLIC_FRONTEND                = data.aws_ssm_parameter.public_url.value,
      PASS_CANCELLATION_ROUTE        = data.aws_ssm_parameter.pass_cancellation_route.value,
      PASS_SHORTDATE_INDEX           = data.aws_ssm_parameter.pass_shortdate_index.value, 
      GC_NOTIFY_API_BULK_PATH        = data.aws_ssm_parameter.gc_notify_api_bulk_path.value, 
      GC_NOTIFY_API_KEY              = data.aws_ssm_parameter.gc_notify_api_key.value, 
      GC_NOTIFY_REMINDER_TEMPLATE_ID = data.aws_ssm_parameter.gc_notify_reminder_template_id.value, 
      GC_NOTIFY_IS_SENDING_REMINDERS = data.aws_ssm_parameter.gc_notify_is_sending_reminders.value,
      RC_ALERT_WEBHOOK_URL           = data.aws_ssm_parameter.rc_alert_webhook_url.value,
      RC_ALERT_WEBHOOK_TOKEN         = data.aws_ssm_parameter.rc_alert_webhook_token.value,
      LOG_LEVEL                      = "info"
    }
  }
  role = aws_iam_role.metaWriteRole.arn
}

resource "aws_lambda_alias" "send_reminder_latest" {
  name             = "latest"
  function_name    = aws_lambda_function.send_reminder.function_name
  function_version = aws_lambda_function.send_reminder.version
}

# Every day at 23:00 UTC (16:00 PDT) = cron(0 23 * * ? *)
resource "aws_cloudwatch_event_rule" "send_reminder_cronjob" {
  name                = "send_reminder_cronjob"
  description         = "Sends scheduled pass reminder at 16:00 PDT"
  schedule_expression = "cron(0 23 * * ? *)"
}

resource "aws_cloudwatch_event_target" "send_reminder_cronjob_target" {
  rule      = aws_cloudwatch_event_rule.send_reminder_cronjob.name
  target_id = "send_reminder"
  arn       = aws_lambda_function.send_reminder.arn
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_send_reminder" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.send_reminder.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.send_reminder_cronjob.arn
}
