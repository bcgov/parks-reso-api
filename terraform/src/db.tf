resource "aws_dynamodb_table" "park_dup_table" {
  name           = var.db_name
  hash_key       = "pk"
  range_key      = "sk"
  read_capacity  = 1
  write_capacity = 1

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }
}