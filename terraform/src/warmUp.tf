resource "aws_lambda_function" "warm_up" {
  function_name = "warmUp"

  filename         = "artifacts/warmUp.zip"
  source_code_hash = filebase64sha256("artifacts/warmUp.zip")

  handler = "lambda/warmUp/index.handler"
  runtime = "nodejs14.x"
  publish = "true"

  timeout = 45
  memory_size = 2048

  environment {
    variables = {
      TABLE_NAME = data.aws_ssm_parameter.db_name.value
    }
  }
  role = aws_iam_role.warmUpRole.arn
}

resource "aws_lambda_alias" "warm_up_latest" {
  name             = "latest"
  function_name    = aws_lambda_function.warm_up.function_name
  function_version = aws_lambda_function.warm_up.version
}

resource "aws_cloudwatch_event_rule" "warm_up_every_morning" {
  name                = "warm-up-every-morning"
  description         = "Fires at 6:45, 6:46, 6:47, 6:48, 6:49 in the morning"
  schedule_expression = "cron(57,58,59 13 ? * * *)"
}

resource "aws_cloudwatch_event_target" "warm_up_every_morning" {
  rule      = aws_cloudwatch_event_rule.warm_up_every_morning.name
  input = <<DOC
    {
      "configArray": [{
          "funcName": "readConfig",
          "funcVersion": "latest",
          "concurrency": "10"
        },
        {
          "funcName": "readPark",
          "funcVersion": "latest",
          "concurrency": "10"
        },
        {
          "funcName": "readFacility",
          "funcVersion": "latest",
          "concurrency": "10"
        },
        {
          "funcName": "readReservation",
          "funcVersion": "latest",
          "concurrency": "10"
        },
        {
          "funcName": "generateCaptcha",
          "funcVersion": "latest",
          "concurrency": "5"
        },
        {
          "funcName": "verifyCaptcha",
          "funcVersion": "latest",
          "concurrency": "5"
        },
        {
          "funcName": "writePass",
          "funcVersion": "latest",
          "concurrency": "5"
        }
      ]
    }
    DOC
  target_id = "warm_up"
  arn       = aws_lambda_function.warm_up.arn
}

resource "aws_lambda_permission" "allow_cloudwatch_to_call_warm_up" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.warm_up.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.warm_up_every_morning.arn
}
