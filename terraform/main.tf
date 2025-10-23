provider "aws" {
  region = "ap-southeast-2"
  # profile = "CAB432-STUDENT-901444280953"  # <- uncomment if you use this profile
}

# Make names unique (S3 requires global uniqueness; suffix also avoids clashes elsewhere)
resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

# --- S3 (demo) ---
resource "aws_s3_bucket" "demo" {
  bucket        = "n12126179-demo-${random_string.suffix.result}"
  force_destroy = true
}

resource "aws_s3_bucket_cors_configuration" "demo" {
  bucket = aws_s3_bucket.demo.id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
  }
}

# --- DynamoDB (demo) ---
resource "aws_dynamodb_table" "demo" {
  name         = "n12126179-demo-table-${random_string.suffix.result}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}

# --- Cognito (demo) ---
resource "aws_cognito_user_pool" "demo" {
  name                     = "n12126179-demo-user-pool-${random_string.suffix.result}"
  auto_verified_attributes = ["email"]
}

resource "aws_cognito_user_pool_client" "demo_client" {
  name            = "n12126179-demo-client-${random_string.suffix.result}"
  user_pool_id    = aws_cognito_user_pool.demo.id
  generate_secret = false
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]
}
