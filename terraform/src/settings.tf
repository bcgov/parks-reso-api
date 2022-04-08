// Deploys the lambda via the zip above
resource "aws_lambda_function" "readConfigLambda" {
  function_name = "readConfig"

  filename         = "artifacts/readConfig.zip"
  source_code_hash = filebase64sha256("artifacts/readConfig.zip")

  handler = "lambda/readConfig/index.handler"
  runtime = "nodejs14.x"
  publish = "true"

  memory_size = 768

  environment {
    variables = {
      TABLE_NAME = data.aws_ssm_parameter.db_name.value
      SSO_ISSUER = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI = data.aws_ssm_parameter.sso_jwksuri.value,
    }
  }

  role = aws_iam_role.readRole.arn
}

resource "aws_lambda_alias" "readConfigLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.readConfigLambda.function_name
  function_version = aws_lambda_function.readConfigLambda.version
}

resource "null_resource" "alias_provisioned_concurrency_transition_delay_read_config_lambda" {
  depends_on = [aws_lambda_alias.readConfigLambdaLatest]
  provisioner "local-exec" {
   command = "sleep 240"
  }
  triggers = {
     function_version = "${aws_lambda_function.readConfigLambda.version}"
  }
}

resource "aws_lambda_provisioned_concurrency_config" "readConfigLambda" {
  depends_on = [null_resource.alias_provisioned_concurrency_transition_delay_read_config_lambda]
  function_name                     = aws_lambda_alias.readConfigLambdaLatest.function_name
  provisioned_concurrent_executions = 3
  qualifier                         = aws_lambda_alias.readConfigLambdaLatest.name
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "writeConfigLambda" {
  function_name = "writeConfig"

  filename         = "artifacts/writeConfig.zip"
  source_code_hash = filebase64sha256("artifacts/writeConfig.zip")

  handler = "lambda/writeConfig/index.handler"
  runtime = "nodejs14.x"
  publish = "true"

  environment {
    variables = {
      TABLE_NAME = data.aws_ssm_parameter.db_name.value
    }
  }

  role = aws_iam_role.writeRole.arn
}

resource "aws_lambda_alias" "writeConfigLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.writeConfigLambda.function_name
  function_version = aws_lambda_function.writeConfigLambda.version
}

resource "aws_api_gateway_resource" "configResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "config"
}

// Defines the HTTP GET /config API
resource "aws_api_gateway_method" "readConfigMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.configResource.id
  http_method   = "GET"
  authorization = "NONE"
}

// Defines the HTTP POST /config API
resource "aws_api_gateway_method" "writeConfigMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.configResource.id
  http_method   = "POST"
  authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "readConfigIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.configResource.id
  http_method = aws_api_gateway_method.readConfigMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.readConfigLambda.invoke_arn
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "writeConfigIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.configResource.id
  http_method = aws_api_gateway_method.writeConfigMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.writeConfigLambda.invoke_arn
}

resource "aws_lambda_permission" "readConfigPermission" {
  statement_id  = "AllowParksDayUseConfigAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.readConfigLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/config"
}

resource "aws_lambda_permission" "writeConfigPermission" {
  statement_id  = "AllowParksDayUseConfigAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.writeConfigLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/POST/config"
}

//CORS
resource "aws_api_gateway_method" "config_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.configResource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "config_options_200" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.configResource.id
  http_method = aws_api_gateway_method.config_options_method.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  depends_on = [aws_api_gateway_method.config_options_method]
}

resource "aws_api_gateway_integration" "config_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.configResource.id
  http_method = aws_api_gateway_method.config_options_method.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" : "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.config_options_method]
}

resource "aws_api_gateway_integration_response" "config_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.configResource.id
  http_method = aws_api_gateway_method.config_options_method.http_method

  status_code = aws_api_gateway_method_response.config_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_method_response.config_options_200]
}
