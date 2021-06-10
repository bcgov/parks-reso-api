// Auto pack lambda function.
data "archive_file" "sendEmailZip" {
    type        = "zip"
    source_dir  = "../sendEmail"
    output_path = "sendEmail.zip"
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "sendEmailLambda" {
   function_name = "sendEmail"
   filename = "sendEmail.zip"
   source_code_hash = "${data.archive_file.sendEmailZip.output_base64sha256}"

#    This method is for deploying things outside of TF.
#    s3_bucket = var.s3_bucket
#    s3_key    = "v1.0.0/sendEmail.zip"

   handler = "index.handler"
   runtime = "nodejs12.x"

   environment {
    variables = {
      TABLE_NAME = var.db_name
    }
  }

   role = aws_iam_role.writeRole.arn
}

resource "aws_api_gateway_resource" "emailResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "email"
}

// Defines the HTTP POST /email API
resource "aws_api_gateway_method" "sendEmailMethod" {
   rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
   resource_id   = aws_api_gateway_resource.emailResource.id
   http_method   = "POST"
   authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "sendEmailIntegration" {
   rest_api_id = aws_api_gateway_rest_api.apiLambda.id
   resource_id = aws_api_gateway_resource.emailResource.id
   http_method = aws_api_gateway_method.sendEmailMethod.http_method

   integration_http_method = "POST"
   type                    = "AWS_PROXY"
   uri                     = aws_lambda_function.sendEmailLambda.invoke_arn
}

resource "aws_lambda_permission" "sendEmailPermission" {
   statement_id  = "AllowParksDayUseEmailAPIInvoke"
   action        = "lambda:InvokeFunction"
   function_name = aws_lambda_function.sendEmailLambda.function_name
   principal     = "apigateway.amazonaws.com"
   source_arn = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/*/*"
}
