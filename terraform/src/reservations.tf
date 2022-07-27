// Deploys the lambda via the zip above
resource "aws_lambda_function" "readReservationLambda" {
  function_name = "readReservation"

  filename         = "artifacts/readReservation.zip"
  source_code_hash = filebase64sha256("artifacts/readReservation.zip")

  handler = "lambda/readReservation/index.handler"
  runtime = "nodejs14.x"
  publish = "true"

  memory_size = 768
  timeout = 10

  environment {
    variables = {
      TABLE_NAME   = data.aws_ssm_parameter.db_name.value,
      SSO_ISSUER   = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI  = data.aws_ssm_parameter.sso_jwksuri.value,
    }
  }

  role = aws_iam_role.readRole.arn
}

resource "aws_lambda_alias" "readReservationLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.readReservationLambda.function_name
  function_version = aws_lambda_function.readReservationLambda.version
}

resource "null_resource" "alias_provisioned_concurrency_transition_delay_read_reservation_lambda" {
  depends_on = [aws_lambda_alias.readReservationLambdaLatest]
  provisioner "local-exec" {
   command = "sleep 240"
  }
  triggers = {
     function_version = "${aws_lambda_function.readReservationLambda.version}"
  }
}

resource "aws_lambda_provisioned_concurrency_config" "readReservationLambda" {
  depends_on = [null_resource.alias_provisioned_concurrency_transition_delay_read_reservation_lambda]
  function_name                     = aws_lambda_alias.readReservationLambdaLatest.function_name
  provisioned_concurrent_executions = 2
  qualifier                         = aws_lambda_alias.readReservationLambdaLatest.name
}

resource "aws_api_gateway_resource" "reservationResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "reservation"
}

// Defines the HTTP GET /reservation API
resource "aws_api_gateway_method" "readReservationMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.reservationResource.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_lambda_permission" "readReservationPermission" {
  statement_id  = "AllowParksDayUseReservationAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.readReservationLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/reservation"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "readReservationIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.reservationResource.id
  http_method = aws_api_gateway_method.readReservationMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.readReservationLambda.invoke_arn
}

//CORS
resource "aws_api_gateway_method" "reservation_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.reservationResource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "reservation_options_200" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.reservationResource.id
  http_method = aws_api_gateway_method.reservation_options_method.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  depends_on = [aws_api_gateway_method.reservation_options_method]
}

resource "aws_api_gateway_integration" "reservations_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.reservationResource.id
  http_method = aws_api_gateway_method.reservation_options_method.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" : "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.reservation_options_method]
}

resource "aws_api_gateway_integration_response" "reservation_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.reservationResource.id
  http_method = aws_api_gateway_method.reservation_options_method.http_method

  status_code = aws_api_gateway_method_response.reservation_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_method_response.reservation_options_200]
}
