resource "aws_lambda_function" "expiry_sqs_processor" {
  function_name = "expirySQSProcessor${var.env_identifier}"

  filename         = "artifacts/expirySQSProcessor.zip"
  source_code_hash = filebase64sha256("artifacts/expirySQSProcessor.zip")

  handler = "lambda/purgeExpired/index.handler"
  runtime = "nodejs18.x"
  timeout = 60
  publish = "true"

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.park_dup_table.name,
      LOG_LEVEL   = "debug"
    }
  }
  role = aws_iam_role.readRole.arn
}

resource "aws_lambda_alias" "expiry_sqs_processor_latest" {
  name             = "latest"
  function_name    = aws_lambda_function.expiry_sqs_processor.function_name
  function_version = aws_lambda_function.expiry_sqs_processor.version
}

resource "aws_sqs_queue" "expiry_queue" {
  name = "expiry-queue${var.env_identifier}"
  delay_seconds = 425 # Slightly more than the pass expiration.
}

resource "aws_sns_topic" "expiry_sqs_topic" {
  name = "expiry-sqs-topic${var.env_identifier}"
}

data "aws_iam_policy_document" "sns-q-expiry-topic-policy" {
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
      identifiers = [aws_iam_role.writeRole.arn,aws_iam_role.readRole.arn]
    }

    resources = [aws_sns_topic.expiry_sqs_topic.arn]
  }

  statement {
    sid     = "AWSEvents_capture-autoscaling-events_SendToSNS"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    resources = [aws_sns_topic.expiry_sqs_topic.arn]
  }
}


resource "aws_sns_topic_policy" "expiry-sqs-topic-policy" {
  arn    = aws_sns_topic.expiry_sqs_topic.arn
  policy = data.aws_iam_policy_document.sns-q-expiry-topic-policy.json
}

resource "aws_sns_topic_subscription" "expiry_sqs_subscription" {
  topic_arn = aws_sns_topic.expiry_sqs_topic.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.expiry_queue.arn
}

resource "aws_lambda_event_source_mapping" "expiry_sqs_event_source_mapping" {
  event_source_arn = aws_sqs_queue.expiry_queue.arn
  enabled          = true
  function_name    = aws_lambda_function.expiry_sqs_processor.arn
  batch_size       = 1
}

resource "aws_sqs_queue_policy" "sqs_q_expiry_queue_policy" {
  queue_url = aws_sqs_queue.expiry_queue.id

  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Id": "sqspolicy",
  "Statement": [
    {
      "Sid": "First",
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "${aws_iam_role.writeRole.arn}",
          "${aws_iam_role.readRole.arn}"
        ]
      },
      "Action": [
         "sqs:DeleteMessage",
         "sqs:GetQueueAttributes",
         "sqs:ReceiveMessage",
         "sqs:SendMessage"
      ],
      "Resource": "${aws_sqs_queue.expiry_queue.arn}"
    }
  ]
}
POLICY
}
