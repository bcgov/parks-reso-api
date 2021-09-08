terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = "3.46.0"
    }
  }
}

provider "aws" {
  alias  = "ca"
  region = var.aws_region
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "readParkLambda" {
  function_name = "readPark"

  # This method is for deploying things outside of TF.
  s3_bucket = "${var.s3_bucket}-${var.target_env}"
  s3_key    = "${var.app_version}/readPark.zip"

  handler = "index.handler"
  runtime = "nodejs12.x"

  environment {
    variables = {
      TABLE_NAME = var.db_name
    }
  }

   role = aws_iam_role.readRole.arn
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "writeParkLambda" {
  function_name = "writePark"

  # This method is for deploying things outside of TF.
  s3_bucket = "${var.s3_bucket}-${var.target_env}"
  s3_key    =  "${var.app_version}/writePark.zip"

  handler = "index.handler"
  runtime = "nodejs12.x"

  environment {
    variables = {
      TABLE_NAME = var.db_name
    }
  }

  role = aws_iam_role.writeRole.arn
}

resource "aws_api_gateway_rest_api" "apiLambda" {
  name        = "ParksDayUsePassAPI"
  description = "BC Parks DUP API"
}

resource "aws_api_gateway_resource" "readResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "park"
}

// Defines the HTTP GET /park API
resource "aws_api_gateway_method" "readMethod" {
   rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
   resource_id   = aws_api_gateway_resource.readResource.id
   http_method   = "GET"
   authorization = "NONE"
}

// Defines the HTTP POST /park API
resource "aws_api_gateway_method" "writeMethod" {
   rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
   resource_id   = aws_api_gateway_resource.readResource.id
   http_method   = "POST"
   authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "readIntegration" {
   rest_api_id = aws_api_gateway_rest_api.apiLambda.id
   resource_id = aws_api_gateway_resource.readResource.id
   http_method = aws_api_gateway_method.readMethod.http_method

   integration_http_method = "POST"
   type                    = "AWS_PROXY"
   uri                     = aws_lambda_function.readParkLambda.invoke_arn
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "writeIntegration" {
   rest_api_id = aws_api_gateway_rest_api.apiLambda.id
   resource_id = aws_api_gateway_resource.readResource.id
   http_method = aws_api_gateway_method.writeMethod.http_method

   integration_http_method = "POST"
   type                    = "AWS_PROXY"
   uri                     = aws_lambda_function.writeParkLambda.invoke_arn
}

resource "aws_api_gateway_deployment" "apideploy" {
   depends_on = [ aws_api_gateway_integration.readIntegration,
                  aws_api_gateway_integration.writeIntegration,
                  aws_api_gateway_integration.readPassIntegration,
                  aws_api_gateway_integration.writePassIntegration,
                  aws_api_gateway_integration.deletePassIntegration]

   rest_api_id = aws_api_gateway_rest_api.apiLambda.id

   // TODO: Change this from prod to version??
   stage_name  = "api"
}

resource "aws_lambda_permission" "readPermission" {
   statement_id  = "AllowParksDayUsePassAPIInvoke"
   action        = "lambda:InvokeFunction"
   function_name = aws_lambda_function.readParkLambda.function_name
   principal     = "apigateway.amazonaws.com"
   source_arn = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/park"
}

resource "aws_lambda_permission" "writePermission" {
   statement_id  = "AllowParksDayUsePassAPIInvoke"
   action        = "lambda:InvokeFunction"
   function_name = aws_lambda_function.writeParkLambda.function_name
   principal     = "apigateway.amazonaws.com"
   source_arn = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/POST/park"
}

//CORS
resource "aws_api_gateway_method" "park_options_method" {
    rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
    resource_id   = aws_api_gateway_resource.readResource.id
    http_method   = "OPTIONS"
    authorization = "NONE"
}

resource "aws_api_gateway_method_response" "park_options_200" {
    rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
    resource_id   = aws_api_gateway_resource.readResource.id
    http_method   = aws_api_gateway_method.park_options_method.http_method
    status_code   = "200"
    response_models = {
        "application/json" = "Empty"
    }
    response_parameters = {
        "method.response.header.Access-Control-Allow-Headers" = true,
        "method.response.header.Access-Control-Allow-Methods" = true,
        "method.response.header.Access-Control-Allow-Origin" = true
    }
    depends_on = [aws_api_gateway_method.park_options_method]
}

resource "aws_api_gateway_integration" "park_options_integration" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.readResource.id
  http_method   = aws_api_gateway_method.park_options_method.http_method
  type          = "MOCK"
  request_templates = {
    "application/json": "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.park_options_method]
}

resource "aws_api_gateway_integration_response" "park_options_integration_response" {
    rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
    resource_id   = aws_api_gateway_resource.readResource.id
    http_method   = aws_api_gateway_method.park_options_method.http_method

    status_code   = aws_api_gateway_method_response.park_options_200.status_code
    response_parameters = {
        "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT'",
        "method.response.header.Access-Control-Allow-Origin" = "'*'"
    }
    depends_on = [aws_api_gateway_method_response.park_options_200]
}

// Tells us what our api endpoint is in the CLI
output "base_url" {
  value = aws_api_gateway_deployment.apideploy.invoke_url
}

resource "aws_iam_policy" "lambda_logging" {
  name        = "lambda_logging"
  path        = "/"
  description = "IAM policy for logging from a lambda"

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*",
      "Effect": "Allow"
    }
  ]
}
EOF
}

resource "aws_iam_role_policy_attachment" "lambda_read_logs" {
  role       = aws_iam_role.readRole.name
  policy_arn = aws_iam_policy.lambda_logging.arn
}

resource "aws_iam_role_policy_attachment" "lambda_write_logs" {
  role       = aws_iam_role.writeRole.name
  policy_arn = aws_iam_policy.lambda_logging.arn
}

resource "aws_iam_role_policy_attachment" "lambda_delete_logs" {
  role       = aws_iam_role.deleteRole.name
  policy_arn = aws_iam_policy.lambda_logging.arn
}

resource "aws_api_gateway_account" "DUPAPIGateway" {
  cloudwatch_role_arn = aws_iam_role.cloudwatch.arn
}

resource "aws_iam_role" "cloudwatch" {
  name = "api_gateway_cloudwatch_global"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "apigateway.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
}

resource "aws_iam_role_policy" "cloudwatch" {
  name = "default"
  role = aws_iam_role.cloudwatch.id

  policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:DescribeLogGroups",
                "logs:DescribeLogStreams",
                "logs:PutLogEvents",
                "logs:GetLogEvents",
                "logs:FilterLogEvents"
            ],
            "Resource": "*"
        }
    ]
}
EOF
}
