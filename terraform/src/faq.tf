data "aws_secretsmanager_secret_version" "jwtFaq" {
  secret_id = "${var.target_env}/ParksResoAPI/jwtSecret"
}

locals {
  jwtSecretFaq = jsondecode(
    data.aws_secretsmanager_secret_version.jwtFaq.secret_string
  )
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "readFaqLambda" {
  function_name = "readFaq${var.env_identifier}"

  filename         = "artifacts/readFaq.zip"
  source_code_hash = filebase64sha256("artifacts/readFaq.zip")

  handler = "lambda/readFaq/index.handler"
  runtime = "nodejs14.x"
  timeout = 6
  publish = "true"

  memory_size = 768

  environment {
    variables = {
      TABLE_NAME                   = aws_dynamodb_table.park_dup_table.name,
      JWT_SECRET                   = local.jwtSecretFaq.jwtSecret,
      PUBLIC_FRONTEND              = data.aws_ssm_parameter.public_url.value,
      SSO_ISSUER                   = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI                  = data.aws_ssm_parameter.sso_jwksuri.value,
      LOG_LEVEL                    = "info"
    }
  }

  role = aws_iam_role.readRole.arn
}

resource "aws_lambda_alias" "readFaqLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.readFaqLambda.function_name
  function_version = aws_lambda_function.readFaqLambda.version
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "writeFaqLambda" {
  function_name = "writeFaq${var.env_identifier}"

  filename         = "artifacts/writeFaq.zip"
  source_code_hash = filebase64sha256("artifacts/writeFaq.zip")

  handler = "lambda/writeFaq/index.handler"
  runtime = "nodejs14.x"
  memory_size = 768
  timeout = 20
  publish = "true"

  environment {
    variables = {
      TABLE_NAME                            = aws_dynamodb_table.park_dup_table.name,
      JWT_SECRET                            = local.jwtSecret.jwtSecret,
      PUBLIC_FRONTEND                       = data.aws_ssm_parameter.public_url.value,
      ADMIN_FRONTEND                        = data.aws_ssm_parameter.admin_url.value,
      SSO_ISSUER                            = data.aws_ssm_parameter.sso_issuer.value,
      SSO_JWKSURI                           = data.aws_ssm_parameter.sso_jwksuri.value,
      LOG_LEVEL                             = "debug"
    }
  }

  role = aws_iam_role.writeRole.arn
}

resource "aws_lambda_alias" "writeFaqLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.writeFaqLambda.function_name
  function_version = aws_lambda_function.writeFaqLambda.version
}

resource "null_resource" "alias_provisioned_concurrency_transition_delay_write_faq_lambda" {
  depends_on = [aws_lambda_alias.writeFaqLambdaLatest]
  provisioner "local-exec" {
   command = "sleep 240"
  }
  triggers = {
     function_version = aws_lambda_function.writeFaqLambda.version
  }
}

resource "aws_lambda_provisioned_concurrency_config" "writeFaqLambda" {
  depends_on = [null_resource.alias_provisioned_concurrency_transition_delay_write_faq_lambda]
  function_name                     = aws_lambda_alias.writeFaqLambdaLatest.function_name
  provisioned_concurrent_executions = 2
  qualifier                         = aws_lambda_alias.writeFaqLambdaLatest.name
}

resource "aws_api_gateway_resource" "faqResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "faq"
}

// Defines the HTTP GET /faq API
resource "aws_api_gateway_method" "readFaqMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.faqResource.id
  http_method   = "GET"
  authorization = "NONE"
}
//Integrate GET Method
resource "aws_api_gateway_integration" "getFaqIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.faqResource.id
  http_method = aws_api_gateway_method.readFaqMethod.http_method

  integration_http_method = "GET"  
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.readFaqLambda.invoke_arn
}

// Defines the HTTP PUT /faq API
resource "aws_api_gateway_method" "putFaqMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.faqResource.id
  http_method   = "PUT"
  authorization = "NONE"
}

// Integrates the APIG to Lambda via PUT method
resource "aws_api_gateway_integration" "putFaqIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.faqResource.id
  http_method = aws_api_gateway_method.putFaqMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.writeFaqLambda.invoke_arn
}


//CORS
resource "aws_api_gateway_method" "faq_options_method" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = aws_api_gateway_resource.faqResource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "faq_options_200" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.faqResource.id
  http_method = aws_api_gateway_method.faq_options_method.http_method
  status_code = "200"
  response_models = {
    "application/json" = "Empty"
  }
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
  depends_on = [aws_api_gateway_method.faq_options_method]
}

resource "aws_api_gateway_integration" "faq_options_integration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.faqResource.id
  http_method = aws_api_gateway_method.faq_options_method.http_method
  type        = "MOCK"
  request_templates = {
    "application/json" : "{\"statusCode\": 200}"
  }
  depends_on = [aws_api_gateway_method.faq_options_method]
}

resource "aws_api_gateway_integration_response" "faq_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = aws_api_gateway_resource.faqResource.id
  http_method = aws_api_gateway_method.faq_options_method.http_method

  status_code = aws_api_gateway_method_response.faq_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-App-Version'",
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT,DELETE'",
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  depends_on = [aws_api_gateway_method_response.faq_options_200]
}
