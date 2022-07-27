terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
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

  filename         = "artifacts/readPark.zip"
  source_code_hash = filebase64sha256("artifacts/readPark.zip")

  handler = "lambda/readPark/index.handler"
  runtime = "nodejs14.x"
  publish = "true"

  timeout = 30
  memory_size = 768

  environment {
    variables = {
      TABLE_NAME = data.aws_ssm_parameter.db_name.value,
      SSO_ISSUER = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI = data.aws_ssm_parameter.sso_jwksuri.value,
    }
  }

  role = aws_iam_role.readRole.arn
}

resource "aws_lambda_alias" "readParkLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.readParkLambda.function_name
  function_version = aws_lambda_function.readParkLambda.version
}

resource "null_resource" "alias_provisioned_concurrency_transition_delay_read_park_lambda" {
  depends_on = [aws_lambda_alias.readParkLambdaLatest]
  provisioner "local-exec" {
   command = "sleep 240"
  }
  triggers = {
     function_version = "${aws_lambda_function.readParkLambda.version}"
  }
}

resource "aws_lambda_provisioned_concurrency_config" "readParkLambda" {
  depends_on = [null_resource.alias_provisioned_concurrency_transition_delay_read_park_lambda]
  function_name                     = aws_lambda_alias.readParkLambdaLatest.function_name
  provisioned_concurrent_executions = 2
  qualifier                         = aws_lambda_alias.readParkLambdaLatest.name
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "writeParkLambda" {
  function_name = "writePark"

  filename         = "artifacts/writePark.zip"
  source_code_hash = filebase64sha256("artifacts/writePark.zip")

  handler = "lambda/writePark/index.handler"
  runtime = "nodejs14.x"
  publish = "true"

  environment {
    variables = {
      TABLE_NAME = data.aws_ssm_parameter.db_name.value,
      SSO_ISSUER = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI = data.aws_ssm_parameter.sso_jwksuri.value,
    }
  }

  role = aws_iam_role.writeRole.arn
}

resource "aws_lambda_alias" "writeParkLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.writeParkLambda.function_name
  function_version = aws_lambda_function.writeParkLambda.version
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

// Defines the HTTP PUT /park API
resource "aws_api_gateway_method" "putMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.readResource.id
  http_method   = "PUT"
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

resource "aws_api_gateway_integration" "putIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.readResource.id
  http_method = aws_api_gateway_method.putMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.writeParkLambda.invoke_arn
}

resource "aws_api_gateway_deployment" "apideploy" {
  depends_on = [
    aws_api_gateway_integration.readIntegration,
    aws_api_gateway_integration.writeIntegration,
    aws_api_gateway_integration.putIntegration,
    aws_api_gateway_integration.readPassIntegration,
    aws_api_gateway_integration.writePassIntegration,
    aws_api_gateway_integration.deletePassIntegration,
    aws_api_gateway_integration.metricIntegration,
    aws_api_gateway_integration.exportPassIntegration,
    aws_api_gateway_integration.readFacilityIntegration,
    aws_api_gateway_integration.writeFacilityIntegration,
    aws_api_gateway_integration.putFacilityIntegration,
    aws_api_gateway_integration.generateCaptchaIntegration,
    aws_api_gateway_integration.captchaVerifyIntegration,
    aws_api_gateway_integration.captchaAudioIntegration,
    aws_api_gateway_integration.readReservationIntegration
  ]

  rest_api_id = aws_api_gateway_rest_api.apiLambda.id

  triggers = {
    redeployment = sha1(jsonencode(aws_api_gateway_rest_api.apiLambda.body))
  }

  lifecycle {
    create_before_destroy = true
  }

  variables = {
    "timestamp" = timestamp()
  }
}

resource "aws_api_gateway_stage" "api_stage" {
  deployment_id = aws_api_gateway_deployment.apideploy.id
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id

  stage_name = "api"
}

resource "aws_lambda_permission" "readPermission" {
  statement_id  = "AllowParksDayUsePassAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.readParkLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/park"
}

resource "aws_lambda_permission" "writePermission" {
  statement_id  = "AllowParksDayUsePassAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.writeParkLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/POST/park"
}

resource "aws_lambda_permission" "putPermission" {
  statement_id  = "AllowParksDayUsePassAPIInvokePut"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.writeParkLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/PUT/park"
}

//CORS
resource "aws_api_gateway_method" "park_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.readResource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "park_options_200" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.readResource.id
  http_method = aws_api_gateway_method.park_options_method.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  depends_on = [aws_api_gateway_method.park_options_method]
}

resource "aws_api_gateway_integration" "park_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.readResource.id
  http_method = aws_api_gateway_method.park_options_method.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" : "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.park_options_method]
}

resource "aws_api_gateway_integration_response" "park_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.readResource.id
  http_method = aws_api_gateway_method.park_options_method.http_method

  status_code = aws_api_gateway_method_response.park_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
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

resource "aws_iam_role_policy_attachment" "lambda_exportPass_cloudwatch_logs" {
  role       = aws_iam_role.exportRole.name
  policy_arn = aws_iam_policy.lambda_logging.arn
}

resource "aws_iam_role_policy_attachment" "lambda_metric_cloudwatch_logs" {
  role       = aws_iam_role.metricRole.name
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

resource "aws_iam_role_policy_attachment" "lambda_invoke_function" {
  role       = aws_iam_role.warmUpRole.name
  policy_arn = aws_iam_policy.lambda_invoke_function.arn
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

resource "aws_iam_policy" "lambda_invoke_function" {
  name        = "lambda_invoke_function"
  path        = "/"
  description = "IAM policy for Lambda to invoke another Lambda"

  policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "Stmt1464440182000",
            "Effect": "Allow",
            "Action": [
                "lambda:InvokeAsync",
                "lambda:InvokeFunction"
            ],
            "Resource": [
                "*"
            ]
        }
    ]
}
EOF
}