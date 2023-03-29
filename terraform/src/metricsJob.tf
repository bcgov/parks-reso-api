resource "aws_lambda_function" "write_metrics" {
  function_name = "writeMetrics${var.env_identifier}"

  filename         = "artifacts/writeMetrics.zip"
  source_code_hash = filebase64sha256("artifacts/writeMetrics.zip")

  handler = "lambda/writeMetrics/index.handler"
  runtime = "nodejs14.x"
  timeout = 300
  publish = "true"

  environment {
    variables = {
      TABLE_NAME                     = data.aws_ssm_parameter.db_name.value,
      METRICS_TABLE_NAME             = data.aws_ssm_parameter.metrics_db_name.value
      LOG_LEVEL                      = "info"
    }
  }
  role = aws_iam_role.metricsRole.arn
}

resource "aws_lambda_alias" "write_metrics_latest" {
  name             = "latest"
  function_name    = aws_lambda_function.write_metrics.function_name
  function_version = aws_lambda_function.write_metrics.version
}

# Every 5 minutes (starting on the hour), run this. 
resource "aws_cloudwatch_event_rule" "write_metrics_cronjob" {
  name                = "write_metrics_cronjob${var.env_identifier}"
  description         = "Gathers and updates metrics every 5 minutes, starting on the hour."
  schedule_expression = "cron(0/5 * * * ? *)"
}

resource "aws_cloudwatch_event_target" "write_metrics_cronjob_target" {
  rule      = aws_cloudwatch_event_rule.write_metrics_cronjob.name
  target_id = "write_metrics"
  arn       = aws_lambda_function.write_metrics.arn
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_write_metrics" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.write_metrics.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.write_metrics_cronjob.arn
}
