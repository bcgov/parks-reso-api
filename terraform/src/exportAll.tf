# ============= EXPORT ALL INVOKABLE =============
resource "aws_lambda_function" "exportAllInvokableLambda" {
  function_name = "export-invokable"

  filename         = "artifacts/exportAllPassInvokable.zip"
  source_code_hash = filebase64sha256("artifacts/exportAllPassInvokable.zip")

  handler = "lambda/exportAllPass/invokable/index.handler"
  runtime = "nodejs14.x"
  publish = "true"

  timeout = 120
  memory_size = 2048

  environment {
    variables = {
      TABLE_NAME                   = data.aws_ssm_parameter.db_name.value,
      FILE_NAME                    = "DUP_Export",
      SSO_ISSUER                   = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI                  = data.aws_ssm_parameter.sso_jwksuri.value,
      S3_BUCKET_DATA               = data.aws_ssm_parameter.s3_bucket_data.value,
      DISABLE_PROGRESS_UPDATES     = false
    }
  }
  role = aws_iam_role.exportRole.arn
}

resource "aws_lambda_alias" "export_invokable_latest" {
  name             = "latest"
  function_name    = aws_lambda_function.exportAllInvokableLambda.function_name
  function_version = aws_lambda_function.exportAllInvokableLambda.version
}

resource "aws_lambda_function" "exportAllPassLambda" {
  function_name = "exportAllPass"

  filename         = "artifacts/exportAllPassGet.zip"
  source_code_hash = filebase64sha256("artifacts/exportAllPassGet.zip")

  handler = "lambda/exportAllPass/index.handler"
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
      SSO_ISSUER                   = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI                  = data.aws_ssm_parameter.sso_jwksuri.value,
    }
  }

  role = aws_iam_role.exportRole.arn
}

resource "aws_lambda_alias" "exportAllPassLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.exportAllPassLambda.function_name
  function_version = aws_lambda_function.exportAllPassLambda.version
}

resource "aws_api_gateway_resource" "exportAllPassResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "export-all-pass"
}

// Defines the HTTP GET /pass API
resource "aws_api_gateway_method" "exportAllPassMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.exportAllPassResource.id
  http_method   = "GET"
  authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "exportAllPassIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.exportAllPassResource.id
  http_method = aws_api_gateway_method.exportAllPassMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.exportAllPassLambda.invoke_arn
}

resource "aws_lambda_permission" "exportAllPassPermission" {
  statement_id  = "AllowParksDayUsePassAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.exportAllPassLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/export-all-pass"
}

//CORS
resource "aws_api_gateway_method" "exportallpass_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.exportAllPassResource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "exportallpass_options_200" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.exportAllPassResource.id
  http_method = aws_api_gateway_method.exportallpass_options_method.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  depends_on = [aws_api_gateway_method.exportallpass_options_method]
}

resource "aws_api_gateway_integration" "exportallpass_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.exportAllPassResource.id
  http_method = aws_api_gateway_method.exportallpass_options_method.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" : "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.exportallpass_options_method]
}

resource "aws_api_gateway_integration_response" "exportallpass_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.exportAllPassResource.id
  http_method = aws_api_gateway_method.exportallpass_options_method.http_method

  status_code = aws_api_gateway_method_response.exportallpass_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_method_response.exportallpass_options_200]
}
