data "archive_file" "checkExpiryZip" {
    type        = "zip"
    source_dir  = "../checkExpiry"
    output_path = "checkExpiry.zip"
}

resource "aws_lambda_function" "check_expiry" {
   function_name = "checkExpiry"
   filename = "checkExpiry.zip"
   source_code_hash = "${data.archive_file.checkExpiryZip.output_base64sha256}"

   handler = "index.handler"
   runtime = "nodejs12.x"

   environment {
    variables = {
      TABLE_NAME = var.db_name
    }
  }

   role = aws_iam_role.readRole.arn
}

resource "aws_cloudwatch_event_rule" "every_morning_at_12am" {
    name = "every-morning-at-12am"
    description = "Fires every morning at 2pm UTC (12am Pacific)"
    schedule_expression = "cron(5 7 * * ? *)"
}

resource "aws_cloudwatch_event_target" "check_expiry_every_morning_at_12am" {
    rule = "${aws_cloudwatch_event_rule.every_morning_at_12am.name}"
    target_id = "check_expiry"
    arn = "${aws_lambda_function.check_expiry.arn}"
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_check_expiry" {
    statement_id = "AllowExecutionFromCloudWatch"
    action = "lambda:InvokeFunction"
    function_name = "${aws_lambda_function.check_expiry.function_name}"
    principal = "events.amazonaws.com"
    source_arn = "${aws_cloudwatch_event_rule.every_morning_at_12am.arn}"
}
