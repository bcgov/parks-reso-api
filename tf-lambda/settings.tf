// Auto pack lambda function.
data "archive_file" "readConfigZip" {
    type        = "zip"
    source_dir  = "../readConfig"
    output_path = "readConfig.zip"
}

// Auto pack lambda function.
data "archive_file" "writeConfigZip" {
    type        = "zip"
    source_dir  = "../writeConfig"
    output_path = "writeConfig.zip"
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "readConfigLambda" {
   function_name = "readConfig"
   filename = "readConfig.zip"
   source_code_hash = "${data.archive_file.readConfigZip.output_base64sha256}"

   handler = "index.handler"
   runtime = "nodejs12.x"

   environment {
    variables = {
      TABLE_NAME = var.db_name
    }
  }

   role = aws_iam_role.readRole.arn
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "writeConfigLambda" {
   function_name = "writeConfig"
   filename = "writeConfig.zip"
   source_code_hash = "${data.archive_file.writeConfigZip.output_base64sha256}"

   handler = "index.handler"
   runtime = "nodejs12.x"

   environment {
    variables = {
      TABLE_NAME = var.db_name
    }
  }

   role = aws_iam_role.writeRole.arn
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
   source_arn = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/config"
}

resource "aws_lambda_permission" "writeConfigPermission" {
   statement_id  = "AllowParksDayUseConfigAPIInvoke"
   action        = "lambda:InvokeFunction"
   function_name = aws_lambda_function.writeConfigLambda.function_name
   principal     = "apigateway.amazonaws.com"
   source_arn = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/POST/config"
}

//CORS
resource "aws_api_gateway_method" "config_options_method" {
    rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
    resource_id   = aws_api_gateway_resource.configResource.id
    http_method   = "OPTIONS"
    authorization = "NONE"
}

resource "aws_api_gateway_method_response" "config_options_200" {
    rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
    resource_id   = aws_api_gateway_resource.configResource.id
    http_method   = aws_api_gateway_method.config_options_method.http_method
    status_code   = "200"
    response_models = {
        "application/json" = "Empty"
    }
    response_parameters = {
        "method.response.header.Access-Control-Allow-Headers" = true,
        "method.response.header.Access-Control-Allow-Methods" = true,
        "method.response.header.Access-Control-Allow-Origin" = true
    }
    depends_on = [aws_api_gateway_method.config_options_method]
}

resource "aws_api_gateway_integration" "config_options_integration" {
    rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
    resource_id   = aws_api_gateway_resource.configResource.id
    http_method   = aws_api_gateway_method.config_options_method.http_method
    type          = "MOCK"
    depends_on = [aws_api_gateway_method.config_options_method]
}

resource "aws_api_gateway_integration_response" "config_options_integration_response" {
    rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
    resource_id   = aws_api_gateway_resource.configResource.id
    http_method   = aws_api_gateway_method.config_options_method.http_method

    status_code   = aws_api_gateway_method_response.config_options_200.status_code
    response_parameters = {
        "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT'",
        "method.response.header.Access-Control-Allow-Origin" = "'*'"
    }
    depends_on = [aws_api_gateway_method_response.config_options_200]
}