variable "public_frontend" {
  description = "full url to the base of the public front end"
}

variable "target_aws_account_id" {
  description = "AWS workload account id"
}

variable "aws_region" {
  description = "The AWS region things are created in"
  # default     = "ca-central-1"
}

variable "db_name" {
  description = "DynamoDB DB Name"
  # default     = "parkreso"
}

variable "jwtSecret" {
  description = "JWT Secret"
  # default     = "todo-changeme"
}

variable "gc_notify_api_path" {
  description = "Path to GC Notify email API endpoint"
  # default = "https://cgnotify.com/path/to/email/endpoint"
}

variable "gc_notify_api_key" {
  description = "Authorization key for GC Notify"
  # default = "ApiKey-v1 123-abc"
}

variable "gc_notify_parking_receipt_template_id" {
  description = "ID of the email template to use on GC Notify parking passess"
  # default = "123-abc-your-template-id"
}

variable "gc_notify_trail_receipt_template_id" {
  description = "ID of the email template to use on GC Notify trail passess"
  # default = "123-abc-your-template-id"
}

variable "gc_notify_cancel_template_id" {
  description = "ID of the GC Notify email template to use to cancel passes"
  # default = "123-abc-your-template-id"
}

variable "pass_cancellation_route" {
  description = "route to public frontend to cancel a pass"
  # default = "/pass-lookup"
}

variable "target_env" {
  description = "target environment"
}

variable "api_gateway_domain"{
  description = "gateway domain"
}

variable "app_version"{
  description = "app version"
}