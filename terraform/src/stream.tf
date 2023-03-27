resource "aws_lambda_function" "streamLambda" {
  function_name = "stream${var.env_identifier}"

  filename         = "artifacts/streamHandler.zip"
  source_code_hash = filebase64sha256("artifacts/streamHandler.zip")

  handler = "lambda/stream/index.handler"
  runtime = "nodejs14.x"
  timeout = 30
  publish = "true"

  memory_size = 256

  environment {
    variables = {
      TABLE_NAME  = data.aws_ssm_parameter.db_name.value,
      LOG_LEVEL   = "debug"
    }
  }

  role = aws_iam_role.streamRole.arn
}

resource "aws_lambda_alias" "streamLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.streamLambda.function_name
  function_version = aws_lambda_function.streamLambda.version
}

resource "aws_lambda_event_source_mapping" "streamMapping" {
  event_source_arn  = aws_dynamodb_table.park_dup_table.stream_arn
  function_name     = aws_lambda_function.streamLambda.arn
  starting_position = "LATEST"
}

resource "aws_iam_role" "streamRole" {
  name = "lambdaStreamRole${var.env_identifier}"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF
}

resource "aws_iam_role_policy" "dynamodb_read_log_policy" {
  name   = "lambda-streamRole-log-policy"
  role   = aws_iam_role.streamRole.id
  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
        "Action": [ "logs:*" ],
        "Effect": "Allow",
        "Resource": [ "arn:aws:logs:*:*:*" ]
    },
    {
        "Action": [ "dynamodb:BatchGetItem",
                    "dynamodb:GetItem",
                    "dynamodb:GetRecords",
                    "dynamodb:Scan",
                    "dynamodb:Query",
                    "dynamodb:GetShardIterator",
                    "dynamodb:DescribeStream",
                    "dynamodb:ListStreams" ],
        "Effect": "Allow",
        "Resource": [
          "${aws_dynamodb_table.park_dup_table.arn}",
          "${aws_dynamodb_table.park_dup_table.arn}/*"
        ]
    }
  ]
}
EOF
}