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
      TABLE_NAME = var.db_name
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
      TABLE_NAME = var.db_name
    }
  }

   role = aws_iam_role.writeRole.arn
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

resource "aws_lambda_permission" "readPassPermission" {
   statement_id  = "AllowParksDayUsePassAPIInvoke"
   action        = "lambda:InvokeFunction"
   function_name = aws_lambda_function.readPassLambda.function_name
   principal     = "apigateway.amazonaws.com"
   source_arn = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/*/*"
}

resource "aws_lambda_permission" "writePassPermission" {
   statement_id  = "AllowParksDayUsePassAPIInvoke"
   action        = "lambda:InvokeFunction"
   function_name = aws_lambda_function.writePassLambda.function_name
   principal     = "apigateway.amazonaws.com"
   source_arn = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/*/*"
}
