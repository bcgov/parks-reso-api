resource "aws_lambda_function" "update_park_names" {
  function_name = "updateParkNames${var.env_identifier}"

  filename         = "artifacts/updateParkNames.zip"
  source_code_hash = filebase64sha256("artifacts/updateParkNames.zip")

  handler = "lambda/updateParkNames/index.handler"
  runtime = "nodejs14.x"
  timeout = 300
  publish = "true"

  environment {
    variables = {
      TABLE_NAME                     = aws_dynamodb_table.park_dup_table.name,
      DATA_REGISTRY_URL              = data.aws_ssm_parameter.data_registry_url.value,
      LOG_LEVEL                      = "info"
    }
  }
  role = aws_iam_role.metaWriteRole.arn
}

resource "aws_lambda_alias" "update_park_names_latest" {
  name             = "latest"
  function_name    = aws_lambda_function.update_park_names.function_name
  function_version = aws_lambda_function.update_park_names.version
}

# Every day at 08:00 UTC (00:00 PDT) = cron(0 8 * * ? *)
resource "aws_cloudwatch_event_rule" "update_park_names_cronjob" {
  name                = "update_park_names_cronjob"
  description         = "Checks BCParks data registry for park name changes at 00:00 PDT"
  schedule_expression = "cron(0 8 * * ? *)"
}

resource "aws_cloudwatch_event_target" "update_park_names_cronjob_target" {
  rule      = aws_cloudwatch_event_rule.update_park_names_cronjob.name
  target_id = "update_park_names"
  arn       = aws_lambda_function.update_park_names.arn
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_update_park_names" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.update_park_names.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.update_park_names_cronjob.arn
}
