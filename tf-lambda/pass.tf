// Auto pack lambda function.
data "archive_file" "readPassZip" {
    type        = "zip"
    source_dir  = "../readPass"
    output_path = "readPass.zip"
}

// Auto pack lambda function.
data "archive_file" "writePassZip" {
    type        = "zip"
    source_dir  = "../writePass"
    output_path = "writePass.zip"
}

// Auto pack lambda function.
data "archive_file" "deletePassZip" {
    type        = "zip"
    source_dir  = "../deletePass"
    output_path = "deletePass.zip"
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "readPassLambda" {
   function_name = "readPass"
   filename = "readPass.zip"
   source_code_hash = "${data.archive_file.readPassZip.output_base64sha256}"

#    This method is for deploying things outside of TF.
#    s3_bucket = var.s3_bucket
#    s3_key    = "v1.0.0/readPass.zip"

   handler = "index.handler"
   runtime = "nodejs12.x"

   environment {
    variables = {
      TABLE_NAME = var.db_name,
      JWT_SECRET = var.jwtSecret,
      PUBLIC_FRONTEND = var.public_frontend,
      GC_NOTIFY_API_PATH = var.gc_notify_api_path,
      GC_NOTIFY_API_KEY = var.gc_notify_api_key,
      GC_NOTIFY_CANCEL_TEMPLATE_ID = var.gc_notify_cancel_template_id,
      PASS_CANCELLATION_ROUTE = var.pass_cancellation_route
    }
  }

   role = aws_iam_role.readRole.arn
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "writePassLambda" {
   function_name = "writePass"
   filename = "writePass.zip"
   source_code_hash = "${data.archive_file.writePassZip.output_base64sha256}"

#    This method is for deploying things outside of TF.
#    s3_bucket = var.s3_bucket
#    s3_key    = "v1.0.0/writePass.zip"

   handler = "index.handler"
   runtime = "nodejs12.x"

   environment {
    variables = {
      TABLE_NAME = var.db_name,
      JWT_SECRET = var.jwtSecret,
      PUBLIC_FRONTEND = var.public_frontend,
      GC_NOTIFY_API_PATH = var.gc_notify_api_path,
      GC_NOTIFY_API_KEY = var.gc_notify_api_key,
      GC_NOTIFY_PARKING_RECEIPT_TEMPLATE_ID = var.gc_notify_parking_receipt_template_id
      GC_NOTIFY_TRAIL_RECEIPT_TEMPLATE_ID = var.gc_notify_trail_receipt_template_id,
      PASS_CANCELLATION_ROUTE = var.pass_cancellation_route
    }
  }

   role = aws_iam_role.writeRole.arn
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "deletePassLambda" {
   function_name = "deletePass"
   filename = "deletePass.zip"
   source_code_hash = "${data.archive_file.deletePassZip.output_base64sha256}"

#    This method is for deploying things outside of TF.
#    s3_bucket = var.s3_bucket
#    s3_key    = "v1.0.0/deletePass.zip"

   handler = "index.handler"
   runtime = "nodejs12.x"

   environment {
    variables = {
      TABLE_NAME = var.db_name,
      JWT_SECRET = var.jwtSecret
    }
  }

   role = aws_iam_role.deleteRole.arn
}

resource "aws_api_gateway_resource" "passResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "pass"
}

// Defines the HTTP GET /pass API
resource "aws_api_gateway_method" "readPassMethod" {
   rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
   resource_id   = aws_api_gateway_resource.passResource.id
   http_method   = "GET"
   authorization = "NONE"
}

// Defines the HTTP POST /pass API
resource "aws_api_gateway_method" "writePassMethod" {
   rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
   resource_id   = aws_api_gateway_resource.passResource.id
   http_method   = "POST"
   authorization = "NONE"
}

// Defines the HTTP POST /pass API
resource "aws_api_gateway_method" "deletePassMethod" {
   rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
   resource_id   = aws_api_gateway_resource.passResource.id
   http_method   = "DELETE"
   authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "readPassIntegration" {
   rest_api_id = aws_api_gateway_rest_api.apiLambda.id
   resource_id = aws_api_gateway_resource.passResource.id
   http_method = aws_api_gateway_method.readPassMethod.http_method

   integration_http_method = "POST"
   type                    = "AWS_PROXY"
   uri                     = aws_lambda_function.readPassLambda.invoke_arn
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "writePassIntegration" {
   rest_api_id = aws_api_gateway_rest_api.apiLambda.id
   resource_id = aws_api_gateway_resource.passResource.id
   http_method = aws_api_gateway_method.writePassMethod.http_method

   integration_http_method = "POST"
   type                    = "AWS_PROXY"
   uri                     = aws_lambda_function.writePassLambda.invoke_arn
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "deletePassIntegration" {
   rest_api_id = aws_api_gateway_rest_api.apiLambda.id
   resource_id = aws_api_gateway_resource.passResource.id
   http_method = aws_api_gateway_method.deletePassMethod.http_method

   integration_http_method = "POST"
   type                    = "AWS_PROXY"
   uri                     = aws_lambda_function.deletePassLambda.invoke_arn
}

resource "aws_lambda_permission" "readPassPermission" {
   statement_id  = "AllowParksDayUsePassAPIInvoke"
   action        = "lambda:InvokeFunction"
   function_name = aws_lambda_function.readPassLambda.function_name
   principal     = "apigateway.amazonaws.com"
   source_arn = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/GET/pass"
}

resource "aws_lambda_permission" "writePassPermission" {
   statement_id  = "AllowParksDayUsePassAPIInvoke"
   action        = "lambda:InvokeFunction"
   function_name = aws_lambda_function.writePassLambda.function_name
   principal     = "apigateway.amazonaws.com"
   source_arn = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/POST/pass"
}

resource "aws_lambda_permission" "deletePassPermission" {
   statement_id  = "AllowParksDayUsePassAPIInvoke"
   action        = "lambda:InvokeFunction"
   function_name = aws_lambda_function.deletePassLambda.function_name
   principal     = "apigateway.amazonaws.com"
   source_arn = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/DELETE/pass"
}

//CORS
resource "aws_api_gateway_method" "pass_options_method" {
    rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
    resource_id   = aws_api_gateway_resource.passResource.id
    http_method   = "OPTIONS"
    authorization = "NONE"
}

resource "aws_api_gateway_method_response" "pass_options_200" {
    rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
    resource_id   = aws_api_gateway_resource.passResource.id
    http_method   = aws_api_gateway_method.pass_options_method.http_method
    status_code   = "200"
    response_models = {
        "application/json" = "Empty"
    }
    response_parameters = {
        "method.response.header.Access-Control-Allow-Headers" = true,
        "method.response.header.Access-Control-Allow-Methods" = true,
        "method.response.header.Access-Control-Allow-Origin" = true
    }
    depends_on = [aws_api_gateway_method.pass_options_method]
}

resource "aws_api_gateway_integration" "pass_options_integration" {
    rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
    resource_id   = aws_api_gateway_resource.passResource.id
    http_method   = aws_api_gateway_method.pass_options_method.http_method
    type          = "MOCK"
    depends_on = [aws_api_gateway_method.pass_options_method]
}

resource "aws_api_gateway_integration_response" "pass_options_integration_response" {
    rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
    resource_id   = aws_api_gateway_resource.passResource.id
    http_method   = aws_api_gateway_method.pass_options_method.http_method

    status_code   = aws_api_gateway_method_response.pass_options_200.status_code
    response_parameters = {
        "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT'",
        "method.response.header.Access-Control-Allow-Origin" = "'*'"
    }
    depends_on = [aws_api_gateway_method_response.pass_options_200]
}