variable "resource_rest_api_id" {
  description = "Id of the API this resource belongs to"
}

variable "resource_parent_id" {
  description = "Id of the resource this resource belongs to"
}

variable "resource_path_part" {
  description = "Url path of this resource"
}

variable "allowed_headers" {
  description = "Allowed CORS headers"
  default     = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
}

variable "allowed_methods" {
  description = "Allowed CORS methods"
  default     = "'GET,OPTIONS,POST,PUT,DELETE'"
}

variable "allowed_origin" {
  description = "Allowed CORS origins"
  default     = "'*'"
}
