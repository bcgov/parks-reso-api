resource "aws_lambda_function" "check_activation" {
  function_name = "checkActivation${var.env_identifier}"

  filename         = "artifacts/checkActivation.zip"
  source_code_hash = filebase64sha256("artifacts/checkActivation.zip")

  handler = "lambda/checkActivation/index.handler"
  runtime = "nodejs14.x"
  timeout = 300
  publish = "true"

  environment {
    variables = {
      TABLE_NAME = data.aws_ssm_parameter.db_name.value,
      LOG_LEVEL  = "info"
    }
  }
  role = aws_iam_role.readRole.arn
}

resource "aws_lambda_alias" "check_activation_latest" {
  name             = "latest"
  function_name    = aws_lambda_function.check_activation.function_name
  function_version = aws_lambda_function.check_activation.version
}

resource "aws_cloudwatch_event_rule" "activation_every_hour" {
  name                = "activation-every-hour"
  description         = "Fires hourly"
  schedule_expression = "cron(0 * * * ? *)"
}

resource "aws_cloudwatch_event_target" "check_activation_every_hour" {
  rule      = aws_cloudwatch_event_rule.activation_every_hour.name
  target_id = "check_activation"
  arn       = aws_lambda_function.check_activation.arn
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_check_activation" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.check_activation.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.activation_every_hour.arn
}
