data "aws_secretsmanager_secret_version" "jwt" {
  secret_id = "${var.target_env}/ParksResoAPI/jwtSecret"
}

locals {
  jwtSecret = jsondecode(
    data.aws_secretsmanager_secret_version.jwt.secret_string
  )
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "readPassLambda" {
  function_name = "readPass"

  filename         = "artifacts/readPass.zip"
  source_code_hash = filebase64sha256("artifacts/readPass.zip")

  handler = "lambda/readPass/index.handler"
  runtime = "nodejs14.x"
  timeout = 6
  publish = "true"

  memory_size = 768

  environment {
    variables = {
      TABLE_NAME                   = data.aws_ssm_parameter.db_name.value,
      JWT_SECRET                   = local.jwtSecret.jwtSecret,
      PUBLIC_FRONTEND              = data.aws_ssm_parameter.public_url.value,
      GC_NOTIFY_API_PATH           = data.aws_ssm_parameter.gc_notify_api_path.value,
      GC_NOTIFY_API_KEY            = data.aws_ssm_parameter.gc_notify_api_key.value,
      GC_NOTIFY_CANCEL_TEMPLATE_ID = data.aws_ssm_parameter.gc_notify_cancel_template_id.value,
      PASS_CANCELLATION_ROUTE      = data.aws_ssm_parameter.pass_cancellation_route.value,
    }
  }

  role = aws_iam_role.readRole.arn
}

resource "aws_lambda_alias" "readPassLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.readPassLambda.function_name
  function_version = aws_lambda_function.readPassLambda.version
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "writePassLambda" {
  function_name = "writePass"

  filename         = "artifacts/writePass.zip"
  source_code_hash = filebase64sha256("artifacts/writePass.zip")

  handler = "lambda/writePass/index.handler"
  runtime = "nodejs14.x"
  timeout = 10
  publish = "true"

  environment {
    variables = {
      TABLE_NAME                            = data.aws_ssm_parameter.db_name.value,
      JWT_SECRET                            = local.jwtSecret.jwtSecret,
      PUBLIC_FRONTEND                       = data.aws_ssm_parameter.public_url.value,
      GC_NOTIFY_API_PATH                    = data.aws_ssm_parameter.gc_notify_api_path.value,
      GC_NOTIFY_API_KEY                     = data.aws_ssm_parameter.gc_notify_api_key.value,
      GC_NOTIFY_PARKING_RECEIPT_TEMPLATE_ID = data.aws_ssm_parameter.gc_notify_parking_receipt_template_id.value,
      GC_NOTIFY_TRAIL_RECEIPT_TEMPLATE_ID   = data.aws_ssm_parameter.gc_notify_trail_receipt_template_id.value,
      PASS_CANCELLATION_ROUTE               = data.aws_ssm_parameter.pass_cancellation_route.value,
    }
  }

  role = aws_iam_role.writeRole.arn
}

resource "aws_lambda_alias" "writePassLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.writePassLambda.function_name
  function_version = aws_lambda_function.writePassLambda.version
}

resource "null_resource" "alias_provisioned_concurrency_transition_delay_write_pass_lambda" {
  depends_on = [aws_lambda_alias.writePassLambdaLatest]
  provisioner "local-exec" {
   command = "sleep 240"
  }
  triggers = {
     function_version = "${aws_lambda_function.writePassLambda.version}"
  }
}

resource "aws_lambda_provisioned_concurrency_config" "writePassLambda" {
  depends_on = [null_resource.alias_provisioned_concurrency_transition_delay_write_pass_lambda]
  function_name                     = aws_lambda_alias.writePassLambdaLatest.function_name
  provisioned_concurrent_executions = 2
  qualifier                         = aws_lambda_alias.writePassLambdaLatest.name
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "deletePassLambda" {
  function_name = "deletePass"

  filename         = "artifacts/deletePass.zip"
  source_code_hash = filebase64sha256("artifacts/deletePass.zip")

  handler = "lambda/deletePass/index.handler"
  runtime = "nodejs14.x"
  publish = "true"

  environment {
    variables = {
      TABLE_NAME = data.aws_ssm_parameter.db_name.value,
      JWT_SECRET = local.jwtSecret.jwtSecret
    }
  }

  role = aws_iam_role.deleteRole.arn
}

resource "aws_lambda_alias" "deletePassLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.deletePassLambda.function_name
  function_version = aws_lambda_function.deletePassLambda.version
}

resource "aws_api_gateway_resource" "passResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "pass"
}

// Defines the HTTP GET /pass API
resource "aws_api_gateway_method" "readPassMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.passResource.id
  http_method   = "GET"
  authorization = "NONE"
}

// Defines the HTTP POST /pass API
resource "aws_api_gateway_method" "writePassMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.passResource.id
  http_method   = "POST"
  authorization = "NONE"
}

// Defines the HTTP POST /pass API
resource "aws_api_gateway_method" "deletePassMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.passResource.id
  http_method   = "DELETE"
  authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "readPassIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.passResource.id
  http_method = aws_api_gateway_method.readPassMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.readPassLambda.invoke_arn
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "writePassIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.passResource.id
  http_method = aws_api_gateway_method.writePassMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.writePassLambda.invoke_arn
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "deletePassIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.passResource.id
  http_method = aws_api_gateway_method.deletePassMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.deletePassLambda.invoke_arn
}

resource "aws_lambda_permission" "readPassPermission" {
  statement_id  = "AllowParksDayUsePassAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.readPassLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/pass"
}

resource "aws_lambda_permission" "writePassPermission" {
  statement_id  = "AllowParksDayUsePassAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.writePassLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/POST/pass"
}

resource "aws_lambda_permission" "deletePassPermission" {
  statement_id  = "AllowParksDayUsePassAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.deletePassLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/DELETE/pass"
}

//CORS
resource "aws_api_gateway_method" "pass_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.passResource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "pass_options_200" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.passResource.id
  http_method = aws_api_gateway_method.pass_options_method.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  depends_on = [aws_api_gateway_method.pass_options_method]
}

resource "aws_api_gateway_integration" "pass_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.passResource.id
  http_method = aws_api_gateway_method.pass_options_method.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" : "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.pass_options_method]
}

resource "aws_api_gateway_integration_response" "pass_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.passResource.id
  http_method = aws_api_gateway_method.pass_options_method.http_method

  status_code = aws_api_gateway_method_response.pass_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT,DELETE'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_method_response.pass_options_200]
}
