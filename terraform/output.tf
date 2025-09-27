output "s3_bucket" { value = aws_s3_bucket.demo.bucket }
output "ddb_table" { value = aws_dynamodb_table.demo.name }
output "user_pool_id" { value = aws_cognito_user_pool.demo.id }
output "client_id" { value = aws_cognito_user_pool_client.demo_client.id }
