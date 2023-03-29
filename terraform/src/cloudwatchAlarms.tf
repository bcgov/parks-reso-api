resource "aws_lambda_function" "cloudwatch_alarm" {
  function_name = "cloudwatchAlarm${var.env_identifier}"

  filename         = "artifacts/cloudwatchAlarm.zip"
  source_code_hash = filebase64sha256("artifacts/cloudwatchAlarm.zip")

  handler = "lambda/cloudwatchAlarm/index.handler"
  runtime = "nodejs14.x"
  timeout = 30
  publish = "true"

  role = aws_iam_role.readRole.arn

  environment {
    variables = {
      AWS_ACCOUNT_LIST        = data.aws_ssm_parameter.aws_account_list.value,
      ROCKETCHAT_URL          = data.aws_ssm_parameter.rocketchat_url.value,
      ROCKETCHAT_BEARER_TOKEN = data.aws_ssm_parameter.rocketchat_bearer_token.value,
      LOG_LEVEL               = "debug"
    }
  }
}

resource "aws_sns_topic" "cloudwatch_error_alarm" {
  name = "lambda-error-topic"
}

data "aws_iam_policy_document" "sns-topic-policy" {
  policy_id = "__default_policy_ID"

  statement {
    sid    = "__default_statement_ID"
    effect = "Allow"

    actions = [
      "SNS:Subscribe",
      "SNS:SetTopicAttributes",
      "SNS:RemovePermission",
      "SNS:Receive",
      "SNS:Publish",
      "SNS:ListSubscriptionsByTopic",
      "SNS:GetTopicAttributes",
      "SNS:DeleteTopic",
      "SNS:AddPermission",
    ]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceOwner"
      values   = [var.target_aws_account_id]
    }

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.readRole.arn]
    }

    resources = [aws_sns_topic.cloudwatch_error_alarm.arn]
  }

  statement {
    sid     = "AWSEvents_capture-autoscaling-events_SendToSNS"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    resources = [aws_sns_topic.cloudwatch_error_alarm.arn]
  }
}


resource "aws_sns_topic_policy" "default" {
  arn    = aws_sns_topic.cloudwatch_error_alarm.arn
  policy = data.aws_iam_policy_document.sns-topic-policy.json
}

resource "aws_cloudwatch_metric_alarm" "lambda_alert" {
  alarm_name                = "lambda-error-alert"
  comparison_operator       = "GreaterThanThreshold"
  evaluation_periods        = "1"
  metric_name               = "Errors"
  namespace                 = "AWS/Lambda"
  period                    = "10"
  statistic                 = "Sum"
  threshold                 = "0"
  alarm_description         = "This metric monitors all Lambda function invocation errors"
  datapoints_to_alarm       = "1"
  insufficient_data_actions = []
  alarm_actions             = [aws_sns_topic.cloudwatch_error_alarm.arn]
}

resource "aws_sqs_queue" "alarm_queue" {
  name                      = "cloudwatch-alarm-queue"
  message_retention_seconds = 86400
}

resource "aws_sns_topic_subscription" "user_updates_sqs_target" {
  topic_arn = aws_sns_topic.cloudwatch_error_alarm.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.alarm_queue.arn
}

resource "aws_lambda_event_source_mapping" "event_source_mapping" {
  event_source_arn = aws_sqs_queue.alarm_queue.arn
  enabled          = true
  function_name    = aws_lambda_function.cloudwatch_alarm.arn
  batch_size       = 1
}

resource "aws_sqs_queue_policy" "sqs_queue_policy" {
  queue_url = aws_sqs_queue.alarm_queue.id

  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Id": "sqspolicy",
  "Statement": [
    {
      "Sid": "First",
      "Effect": "Allow",
      "Principal": {
        "AWS": "${aws_iam_role.readRole.arn}"
      },
      "Action": [
         "sqs:DeleteMessage",
         "sqs:GetQueueAttributes",
         "sqs:ReceiveMessage",
         "sqs:SendMessage"
      ],
      "Resource": "${aws_sqs_queue.alarm_queue.arn}"
    }
  ]
}
POLICY
}
