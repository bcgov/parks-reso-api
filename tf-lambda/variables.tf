variable "target_env" {
  description = "AWS workload account env (e.g. dev, test, prod, sandbox, unclass)"
}

variable "target_aws_account_id" {
  description = "AWS workload account id"
}

variable "aws_region" {
  description = "The AWS region things are created in"
  default     = "ca-central-1"
}

variable "app_name" {
  description = "Name of the application"
  type        = string
  default     = "parkAPI"
}

variable "db_name" {
  description = "DynamoDB DB Name"
  default     = "parkreso"
}

variable "jwt_secret" {
  description = "JWT Secret"
  default     = "todo-changeme"
}

variable "gc_notify_api_path" {
  description = "Path to GC Notify email API endpoint"
  default = "https://cgnotify.com/path/to/email/endpoint"
}

variable "gc_notify_api_key" {
  description = "Authorization key for GC Notify"
  default = "ApiKey-v1 123-abc"
}

variable "gc_notify_receipt_template_id" {
  description = "ID of the email template to use on GC Notify"
  default = "123-abc-your-template-id"
}

variable "gc_notify_cancel_template_id" {
  description = "ID of the email template to use on GC Notify"
  default = "123-abc-your-template-id"
}

variable "common_tags" {
  description = "Common tags for created resources"
  default = {
    Application = "Park Reservation System"
  }
}

variable "s3_bucket" {}

variable "deployEnvironment" {}