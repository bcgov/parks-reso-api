output "resource" {
  value = aws_api_gateway_resource.this_api_resource
}

output "options_integration" {
  value = aws_api_gateway_integration.this_options_integration
}
