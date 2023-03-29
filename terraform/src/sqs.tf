resource "aws_lambda_function" "sqs_processor" {
  function_name = "sqsProcessor${var.env_identifier}"

  filename         = "artifacts/sqsProcessor.zip"
  source_code_hash = filebase64sha256("artifacts/sqsProcessor.zip")

  handler = "lambda/sqsProcessor/index.handler"
  runtime = "nodejs14.x"
  timeout = 60
  publish = "true"

  environment {
    variables = {
      LOG_LEVEL           = "debug",
      GC_NOTIFY_API_PATH  = data.aws_ssm_parameter.gc_notify_api_path.value,
      GC_NOTIFY_API_KEY   = data.aws_ssm_parameter.gc_notify_api_key.value
    }
  }
  role = aws_iam_role.readRole.arn
}

resource "aws_lambda_alias" "sqs_processor_latest" {
  name             = "latest"
  function_name    = aws_lambda_function.sqs_processor.function_name
  function_version = aws_lambda_function.sqs_processor.version
}

resource "aws_sqs_queue" "gcn_email_queue" {
  name = "gcn-email-queue"
  visibility_timeout_seconds = 60
}

resource "aws_sns_topic" "gcn_email_topic" {
  name = "gcn-email-topic"
}

data "aws_iam_policy_document" "sns-email-topic-policy" {
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

    resources = [aws_sns_topic.gcn_email_topic.arn]
  }

  statement {
    sid     = "AWSEvents_capture-autoscaling-events_SendToSNS"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    resources = [aws_sns_topic.gcn_email_topic.arn]
  }
}


resource "aws_sns_topic_policy" "gcn-email-topic-policy" {
  arn    = aws_sns_topic.gcn_email_topic.arn
  policy = data.aws_iam_policy_document.sns-email-topic-policy.json
}

resource "aws_sns_topic_subscription" "gcn_email_subscription" {
  topic_arn = aws_sns_topic.gcn_email_topic.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.gcn_email_queue.arn
}

resource "aws_lambda_event_source_mapping" "gcn_event_source_mapping" {
  event_source_arn = aws_sqs_queue.gcn_email_queue.arn
  enabled          = true
  function_name    = aws_lambda_function.sqs_processor.arn
  batch_size       = 1
}

resource "aws_sqs_queue_policy" "sqs_email_queue_policy" {
  queue_url = aws_sqs_queue.gcn_email_queue.id

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
      "Resource": "${aws_sqs_queue.gcn_email_queue.arn}"
    }
  ]
}
POLICY
}
