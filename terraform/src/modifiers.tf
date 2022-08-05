// Deploys the lambda via the zip above
resource "aws_lambda_function" "writeModifierLambda" {
  function_name = "writeModifier"

  filename         = "artifacts/writeModifier.zip"
  source_code_hash = filebase64sha256("artifacts/writeModifier.zip")

  handler = "lambda/writeModifier/index.handler"
  runtime = "nodejs14.x"
  publish = "true"

  memory_size = 768
  timeout = 10

  environment {
    variables = {
      TABLE_NAME = data.aws_ssm_parameter.db_name.value
      SSO_ISSUER = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI = data.aws_ssm_parameter.sso_jwksuri.value,
    }
  }

  role = aws_iam_role.writeRole.arn
}

resource "aws_lambda_alias" "writeModifierLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.writeModifierLambda.function_name
  function_version = aws_lambda_function.writeModifierLambda.version
}

resource "aws_api_gateway_resource" "modifierResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "modifier"
}

// Defines the HTTP PUT /modifier API
resource "aws_api_gateway_method" "putModifierMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.modifierResource.id
  http_method   = "PUT"
  authorization = "NONE"
}

resource "aws_lambda_permission" "putModifierPermission" {
  statement_id  = "AllowParksDayUseModifierAPIInvokePut"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.writeModifierLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/PUT/modifier"
}

//CORS
resource "aws_api_gateway_method" "modifier_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.modifierResource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "modifier_options_200" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.modifierResource.id
  http_method = aws_api_gateway_method.modifier_options_method.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  depends_on = [aws_api_gateway_method.modifier_options_method]
}

resource "aws_api_gateway_integration" "modifier_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.modifierResource.id
  http_method = aws_api_gateway_method.modifier_options_method.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" : "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.modifier_options_method]
}

resource "aws_api_gateway_integration_response" "modifier_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.modifierResource.id
  http_method = aws_api_gateway_method.modifier_options_method.http_method

  status_code = aws_api_gateway_method_response.modifier_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_method_response.modifier_options_200]
}
