resource "aws_lambda_function" "exportPassLambda" {
  function_name = "exportPass"

  filename         = "artifacts/exportPass.zip"
  source_code_hash = filebase64sha256("artifacts/exportPass.zip")

  handler = "lambda/exportPass/index.handler"
  runtime = "nodejs14.x"
  timeout = 30
  publish = "true"

  memory_size = 2048

  environment {
    variables = {
      TABLE_NAME                   = data.aws_ssm_parameter.db_name.value,
      JWT_SECRET                   = local.jwtSecret.jwtSecret,
      PUBLIC_FRONTEND              = data.aws_ssm_parameter.public_url.value,
      GC_NOTIFY_API_PATH           = data.aws_ssm_parameter.gc_notify_api_path.value,
      GC_NOTIFY_API_KEY            = data.aws_ssm_parameter.gc_notify_api_key.value,
      GC_NOTIFY_CANCEL_TEMPLATE_ID = data.aws_ssm_parameter.gc_notify_cancel_template_id.value,
      PASS_CANCELLATION_ROUTE      = data.aws_ssm_parameter.pass_cancellation_route.value,
      S3_BUCKET_DATA               = data.aws_ssm_parameter.s3_bucket_data.value,
    }
  }

  role = aws_iam_role.exportRole.arn
}

resource "aws_lambda_alias" "exportPassLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.exportPassLambda.function_name
  function_version = aws_lambda_function.exportPassLambda.version
}

resource "aws_api_gateway_resource" "exportPassResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "export-pass"
}

// Defines the HTTP GET /pass API
resource "aws_api_gateway_method" "exportPassMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.exportPassResource.id
  http_method   = "GET"
  authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "exportPassIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.exportPassResource.id
  http_method = aws_api_gateway_method.exportPassMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.exportPassLambda.invoke_arn
}

resource "aws_lambda_permission" "exportPassPermission" {
  statement_id  = "AllowParksDayUsePassAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.exportPassLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/export-pass"
}

//CORS
resource "aws_api_gateway_method" "exportpass_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.exportPassResource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "exportpass_options_200" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.exportPassResource.id
  http_method = aws_api_gateway_method.exportpass_options_method.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  depends_on = [aws_api_gateway_method.exportpass_options_method]
}

resource "aws_api_gateway_integration" "exportpass_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.exportPassResource.id
  http_method = aws_api_gateway_method.exportpass_options_method.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" : "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.exportpass_options_method]
}

resource "aws_api_gateway_integration_response" "exportpass_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.exportPassResource.id
  http_method = aws_api_gateway_method.exportpass_options_method.http_method

  status_code = aws_api_gateway_method_response.exportpass_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_method_response.exportpass_options_200]
}
