resource "aws_lambda_function" "check_expiry" {
  function_name = "checkExpiry"

  filename         = "artifacts/checkExpiry.zip"
  source_code_hash = filebase64sha256("artifacts/checkExpiry.zip")

  handler = "lambda/checkExpiry/index.handler"
  runtime = "nodejs12.x"

  environment {
    variables = {
      TABLE_NAME = data.aws_ssm_parameter.db_name.value
    }
  }
  role = aws_iam_role.readRole.arn
}

resource "aws_cloudwatch_event_rule" "every_morning_at_12am" {
  name                = "every-morning-at-12am"
  description         = "Fires every morning at 2pm UTC (12am Pacific)"
  schedule_expression = "cron(5 7 * * ? *)"
}

resource "aws_cloudwatch_event_target" "check_expiry_every_morning_at_12am" {
  rule      = aws_cloudwatch_event_rule.every_morning_at_12am.name
  target_id = "check_expiry"
  arn       = aws_lambda_function.check_expiry.arn
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_check_expiry" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.check_expiry.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.every_morning_at_12am.arn
}
