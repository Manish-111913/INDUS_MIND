# Stack outputs — consumed by the deploy pipeline + PRODUCTION.md runbook.

output "alb_dns_name" {
  description = "Public ALB DNS — point the api.<domain> Route53 alias here."
  value       = aws_lb.api.dns_name
}

output "rds_endpoint" {
  description = "RDS Postgres endpoint (host:port)."
  value       = aws_db_instance.main.endpoint
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint."
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "s3_documents_bucket" {
  description = "Document store bucket name."
  value       = aws_s3_bucket.docs.bucket
}

output "ecr_api_repository_url" {
  description = "Push the API image here."
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_worker_repository_url" {
  description = "Push the worker image here."
  value       = aws_ecr_repository.worker.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster (for the migration one-off task + deploys)."
  value       = aws_ecs_cluster.main.name
}

output "app_secret_arn" {
  description = "Secrets Manager ARN to overwrite with the real app secret bundle."
  value       = aws_secretsmanager_secret.app.arn
}

output "alerts_topic_arn" {
  description = "SNS topic for CloudWatch alarms — subscribe email/Slack here."
  value       = aws_sns_topic.alerts.arn
}
