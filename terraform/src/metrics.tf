resource "aws_lambda_function" "metricsLambda" {
  function_name = "readMetrics${var.env_identifier}"

  filename         = "artifacts/readMetrics.zip"
  source_code_hash = filebase64sha256("artifacts/readMetrics.zip")

  handler = "lambda/readMetrics/index.handler"
  runtime = "nodejs14.x"
  timeout = 6
  publish = "true"

  memory_size = 768

  environment {
    variables = {
      METRICS_TABLE_NAME  = data.aws_ssm_parameter.metrics_db_name.value,
      LOG_LEVEL   = "info"
    }
  }

   role = aws_iam_role.metricsRole.arn
}

resource "aws_lambda_alias" "metricsLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.metricsLambda.function_name
  function_version = aws_lambda_function.metricsLambda.version
}

resource "aws_api_gateway_resource" "metricsResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "metrics"
}

// Defines the HTTP GET /metric API
resource "aws_api_gateway_method" "metricsMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.metricsResource.id
  http_method   = "GET"
  authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "metricsIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.metricsResource.id
  http_method = aws_api_gateway_method.metricsMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.metricsLambda.invoke_arn
}

resource "aws_lambda_permission" "metricsPermission" {
  statement_id  = "AllowParksDayUsePassAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.metricsLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/metrics"
}

//CORS
resource "aws_api_gateway_method" "metrics_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.metricsResource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "metrics_options_200" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.metricsResource.id
  http_method = aws_api_gateway_method.metrics_options_method.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  depends_on = [aws_api_gateway_method.metrics_options_method]
}

resource "aws_api_gateway_integration" "metrics_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.metricsResource.id
  http_method = aws_api_gateway_method.metrics_options_method.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" : "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.metrics_options_method]
}

resource "aws_api_gateway_integration_response" "metrics_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.metricsResource.id
  http_method = aws_api_gateway_method.metrics_options_method.http_method

  status_code = aws_api_gateway_method_response.metrics_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_method_response.metrics_options_200]
}
