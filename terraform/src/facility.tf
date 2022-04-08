// Deploys the lambda via the zip above
resource "aws_lambda_function" "readFacilityLambda" {
  function_name = "readFacility"

  filename         = "artifacts/readFacility.zip"
  source_code_hash = filebase64sha256("artifacts/readFacility.zip")

  handler = "lambda/readFacility/index.handler"
  runtime = "nodejs14.x"
  publish = "true"

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

resource "aws_lambda_alias" "readFacilityLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.readFacilityLambda.function_name
  function_version = aws_lambda_function.readFacilityLambda.version
}

resource "null_resource" "alias_provisioned_concurrency_transition_delay_read_facility_lambda" {
  depends_on = [aws_lambda_alias.readFacilityLambdaLatest]
  provisioner "local-exec" {
   command = "sleep 240"
  }
  triggers = {
     function_version = "${aws_lambda_function.readFacilityLambda.version}"
  }
}

resource "aws_lambda_provisioned_concurrency_config" "readFacilityLambda" {
  depends_on = [null_resource.alias_provisioned_concurrency_transition_delay_read_facility_lambda]
  function_name                     = aws_lambda_alias.readFacilityLambdaLatest.function_name
  provisioned_concurrent_executions = 2
  qualifier                         = aws_lambda_alias.readFacilityLambdaLatest.name
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "writeFacilityLambda" {
  function_name = "writeFacility"

  filename         = "artifacts/writeFacility.zip"
  source_code_hash = filebase64sha256("artifacts/writeFacility.zip")

  handler = "lambda/writeFacility/index.handler"
  runtime = "nodejs14.x"
  publish = "true"

  environment {
    variables = {
      TABLE_NAME = data.aws_ssm_parameter.db_name.value
      SSO_ISSUER = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI = data.aws_ssm_parameter.sso_jwksuri.value,
    }
  }

  role = aws_iam_role.writeRole.arn
}

resource "aws_lambda_alias" "writeFacilityLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.writeFacilityLambda.function_name
  function_version = aws_lambda_function.writeFacilityLambda.version
}

resource "aws_api_gateway_resource" "facilityResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "facility"
}

// Defines the HTTP GET /facility API
resource "aws_api_gateway_method" "readFacilityMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.facilityResource.id
  http_method   = "GET"
  authorization = "NONE"
}

// Defines the HTTP POST /facility API
resource "aws_api_gateway_method" "writeFacilityMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.facilityResource.id
  http_method   = "POST"
  authorization = "NONE"
}

// Defines the HTTP PUT /facility API
resource "aws_api_gateway_method" "putFacilityMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.facilityResource.id
  http_method   = "PUT"
  authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "readFacilityIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.facilityResource.id
  http_method = aws_api_gateway_method.readFacilityMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.readFacilityLambda.invoke_arn
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "writeFacilityIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.facilityResource.id
  http_method = aws_api_gateway_method.writeFacilityMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.writeFacilityLambda.invoke_arn
}

resource "aws_api_gateway_integration" "putFacilityIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.facilityResource.id
  http_method = aws_api_gateway_method.putFacilityMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.writeFacilityLambda.invoke_arn
}

resource "aws_lambda_permission" "readFacilityPermission" {
  statement_id  = "AllowParksDayUseFacilityAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.readFacilityLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/facility"
}

resource "aws_lambda_permission" "writeFacilityPermission" {
  statement_id  = "AllowParksDayUseFacilityAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.writeFacilityLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/POST/facility"
}

resource "aws_lambda_permission" "putFacilityPermission" {
  statement_id  = "AllowParksDayUseFacilityAPIInvokePut"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.writeFacilityLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/PUT/facility"
}

//CORS
resource "aws_api_gateway_method" "facility_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.facilityResource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "facility_options_200" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.facilityResource.id
  http_method = aws_api_gateway_method.facility_options_method.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  depends_on = [aws_api_gateway_method.facility_options_method]
}

resource "aws_api_gateway_integration" "facility_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.facilityResource.id
  http_method = aws_api_gateway_method.facility_options_method.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" : "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.facility_options_method]
}

resource "aws_api_gateway_integration_response" "facility_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.facilityResource.id
  http_method = aws_api_gateway_method.facility_options_method.http_method

  status_code = aws_api_gateway_method_response.facility_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_method_response.facility_options_200]
}
