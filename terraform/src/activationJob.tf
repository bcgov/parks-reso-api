resource "aws_lambda_function" "check_activation" {
  function_name = "checkActivation"

  filename         = "artifacts/checkActivation.zip"
  source_code_hash = filebase64sha256("artifacts/checkActivation.zip")

  handler = "index.handler"
  runtime = "nodejs12.x"

  environment {
    variables = {
      TABLE_NAME = data.aws_ssm_parameter.db_name.value
    }
  }
  role = aws_iam_role.readRole.arn
}

resource "aws_cloudwatch_event_rule" "every_morning_at_7am" {
  name                = "every-morning-at-7am"
  description         = "Fires every morning at 2pm UTC (7am Pacific)"
  schedule_expression = "cron(0 14 * * ? *)"
}

resource "aws_cloudwatch_event_target" "check_activation_every_morning_at_7am" {
  rule      = aws_cloudwatch_event_rule.every_morning_at_7am.name
  target_id = "check_activation"
  arn       = aws_lambda_function.check_activation.arn
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_check_activation" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.check_activation.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.every_morning_at_7am.arn
}
