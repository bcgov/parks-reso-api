resource "aws_lambda_function" "check_activation" {
    function_name = "checkActivation"

    s3_bucket = var.s3_bucket
    s3_key    = "checkActivation.zip"

    handler = "index.handler"
    runtime = "nodejs12.x"

    environment {
        variables = {
        TABLE_NAME = var.db_name
        }
    }

   role = aws_iam_role.readRole.arn
}

resource "aws_cloudwatch_event_rule" "every_morning_at_7am" {
    name = "every-morning-at-7am"
    description = "Fires every morning at 2pm UTC (7am Pacific)"
    schedule_expression = "cron(0 14 * * ? *)"
}

resource "aws_cloudwatch_event_target" "check_activation_every_morning_at_7am" {
    rule = aws_cloudwatch_event_rule.every_morning_at_7am.name
    target_id = "check_activation"
    arn = aws_lambda_function.check_activation.arn
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_check_activation" {
    statement_id = "AllowExecutionFromCloudWatch"
    action = "lambda:InvokeFunction"
    function_name = aws_lambda_function.check_activation.function_name
    principal = "events.amazonaws.com"
    source_arn = aws_cloudwatch_event_rule.every_morning_at_7am.arn
}
