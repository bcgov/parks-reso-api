resource "aws_api_gateway_resource" "this_api_resource" {
  rest_api_id = var.resource_rest_api_id
  parent_id   = var.resource_parent_id
  path_part   = var.resource_path_part
}

resource "aws_api_gateway_method" "this_options_method" {
  rest_api_id = var.resource_rest_api_id
  resource_id = aws_api_gateway_resource.this_api_resource.id

  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method_response" "this_options_method_response" {
  rest_api_id = var.resource_rest_api_id
  resource_id = aws_api_gateway_resource.this_api_resource.id
  http_method = aws_api_gateway_method.this_options_method.http_method

  status_code = "200"

  response_models = {
    "application/json" = "Empty"
  }

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true,
    "method.response.header.Access-Control-Allow-Methods" = true,
    "method.response.header.Access-Control-Allow-Origin"  = true
  }

  depends_on = [aws_api_gateway_method.this_options_method]
}

resource "aws_api_gateway_integration" "this_options_integration" {
  rest_api_id = var.resource_rest_api_id
  resource_id = aws_api_gateway_resource.this_api_resource.id
  http_method = aws_api_gateway_method.this_options_method.http_method

  type = "MOCK"

  request_templates = {
    "application/json" : jsonencode({ statusCode = 200 })
  }

  depends_on = [aws_api_gateway_method.this_options_method]
}

resource "aws_api_gateway_integration_response" "config_options_integration_response" {
  rest_api_id = var.resource_rest_api_id
  resource_id = aws_api_gateway_resource.this_api_resource.id
  http_method = aws_api_gateway_method.this_options_method.http_method

  status_code = aws_api_gateway_method_response.this_options_method_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = var.allowed_headers,
    "method.response.header.Access-Control-Allow-Methods" = var.allowed_methods,
    "method.response.header.Access-Control-Allow-Origin"  = var.allowed_origin
  }

  depends_on = [aws_api_gateway_method_response.this_options_method_response]
}
