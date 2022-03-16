resource "aws_lambda_function" "metricLambda" {
  function_name = "metric"

  filename         = "artifacts/metric.zip"
  source_code_hash = filebase64sha256("artifacts/metric.zip")

  handler = "lambda/metric/index.handler"
  runtime = "nodejs14.x"
  timeout = 30
  publish = "true"

  memory_size = 1792

  environment {
    variables = {
      TABLE_NAME                   = data.aws_ssm_parameter.db_name.value,
      JWT_SECRET                   = local.jwtSecret.jwtSecret
    }
  }

  role = aws_iam_role.metricRole.arn
}

resource "aws_lambda_alias" "metricLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.metricLambda.function_name
  function_version = aws_lambda_function.metricLambda.version
}

resource "aws_api_gateway_resource" "metricResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "metric"
}

// Defines the HTTP GET /metric API
resource "aws_api_gateway_method" "metricMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.metricResource.id
  http_method   = "GET"
  authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "metricIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.metricResource.id
  http_method = aws_api_gateway_method.metricMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.metricLambda.invoke_arn
}

resource "aws_lambda_permission" "metricPermission" {
  statement_id  = "AllowParksDayUsePassAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.metricLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/metric"
}

//CORS
resource "aws_api_gateway_method" "metric_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.metricResource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "metric_options_200" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.metricResource.id
  http_method = aws_api_gateway_method.metric_options_method.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  depends_on = [aws_api_gateway_method.metric_options_method]
}

resource "aws_api_gateway_integration" "metric_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.metricResource.id
  http_method = aws_api_gateway_method.metric_options_method.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" : "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.metric_options_method]
}

resource "aws_api_gateway_integration_response" "metric_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.metricResource.id
  http_method = aws_api_gateway_method.metric_options_method.http_method

  status_code = aws_api_gateway_method_response.metric_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_method_response.metric_options_200]
}
