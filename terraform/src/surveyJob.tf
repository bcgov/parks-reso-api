resource "aws_lambda_function" "send_survey_cronjob_target" {
  function_name = "sendSurvey${var.env_identifier}"

  filename         = "artifacts/sendSurvey.zip"
  source_code_hash = filebase64sha256("artifacts/sendSurvey.zip")

  handler = "lambda/sendSurvey/index.handler"
  runtime = "nodejs14.x"
  timeout = 300
  publish = "true"

  environment {
    variables = {
      TABLE_NAME                     = data.aws_ssm_parameter.db_name.value,
      META_TABLE_NAME                = data.aws_ssm_parameter.meta_db_name.value,
      PASS_SHORTDATE_INDEX           = data.aws_ssm_parameter.pass_shortdate_index.value, 
      GC_NOTIFY_API_BULK_PATH        = data.aws_ssm_parameter.gc_notify_api_bulk_path.value, 
      GC_NOTIFY_API_KEY              = data.aws_ssm_parameter.gc_notify_api_key.value, 
      GC_NOTIFY_SURVEY_TEMPLATE_ID   = data.aws_ssm_parameter.gc_notify_survey_template_id.value, 
      GC_NOTIFY_IS_SENDING_SURVEYS   = data.aws_ssm_parameter.gc_notify_is_sending_surveys.value,
      FEEDBACK_SURVEY_URL            = data.aws_ssm_parameter.feedback_survey_url.value,
      RC_ALERT_WEBHOOK_URL           = data.aws_ssm_parameter.rc_alert_webhook_url.value,
      RC_ALERT_WEBHOOK_TOKEN         = data.aws_ssm_parameter.rc_alert_webhook_token.value,
      LOG_LEVEL                      = "info"
    }
  }
  role = aws_iam_role.metaWriteRole.arn
}

resource "aws_lambda_alias" "send_survey_cronjob_target_latest" {
  name             = "latest"
  function_name    = aws_lambda_function.send_survey_cronjob_target.function_name
  function_version = aws_lambda_function.send_survey_cronjob_target.version
}

# Every day at 19:00 UTC (12:00 PDT) = cron(0 19 * * ? *)
resource "aws_cloudwatch_event_rule" "send_survey_cronjob_target_cronjob" {
  name                = "send_survey_cronjob_target_cronjob"
  description         = "Sends scheduled pass reminder at 16:00 PDT"
  schedule_expression = "cron(0 19 * * ? *)"
}

resource "aws_cloudwatch_event_target" "send_survey_cronjob_target_cronjob_target" {
  rule      = aws_cloudwatch_event_rule.send_survey_cronjob_target_cronjob.name
  target_id = "send_survey_cronjob_target"
  arn       = aws_lambda_function.send_survey_cronjob_target.arn
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_send_survey_cronjob_target" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.send_survey_cronjob_target.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.send_survey_cronjob_target_cronjob.arn
}
