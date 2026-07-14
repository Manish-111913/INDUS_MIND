# Managed data services (docs/02 §48, §42): RDS Postgres 16 Multi-AZ (pgvector),
# ElastiCache Redis, S3 (versioned + lifecycle), all KMS-encrypted at rest.

resource "aws_kms_key" "main" {
  description             = "${local.name} data-at-rest encryption"
  deletion_window_in_days = 14
  enable_key_rotation     = true
  tags                    = { Name = "${local.name}-kms" }
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.main.key_id
}

# ── RDS Postgres 16 (pgvector) ────────────────────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db"
  subnet_ids = aws_subnet.isolated[*].id
  tags       = { Name = "${local.name}-db-subnets" }
}

resource "aws_db_parameter_group" "pg16" {
  name        = "${local.name}-pg16"
  family      = "postgres16"
  description = "Postgres 16 params; pgvector enabled via CREATE EXTENSION at migrate time."

  # Surface pgvector/pg_trgm/pgcrypto as available shared libs (extensions are
  # created by the app's alembic migrations, not here).
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_instance" "main" {
  identifier     = "${local.name}-pg"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 4
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.main.arn

  db_name  = "indusmind"
  username = "indusmind"
  password = random_password.db.result

  multi_az               = true
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.pg16.name

  backup_retention_period   = 14 # PITR window (docs/02 §52: 7–35d)
  backup_window             = "18:00-19:00"
  maintenance_window        = "Mon:19:30-Mon:20:30"
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name}-pg-final"
  apply_immediately         = false

  tags = { Name = "${local.name}-pg" }
}

# ── ElastiCache Redis ─────────────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name}-redis"
  subnet_ids = aws_subnet.isolated[*].id
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${local.name}-redis"
  description                = "${local.name} cache + celery broker/result backend"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true

  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = { Name = "${local.name}-redis" }
}

# ── S3 document store ─────────────────────────────────────────────────────────
resource "aws_s3_bucket" "docs" {
  bucket = "${local.name}-documents"
  tags   = { Name = "${local.name}-documents" }
}

resource "aws_s3_bucket_versioning" "docs" {
  bucket = aws_s3_bucket.docs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "docs" {
  bucket = aws_s3_bucket.docs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "docs" {
  bucket                  = aws_s3_bucket.docs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "docs" {
  bucket = aws_s3_bucket.docs.id
  rule {
    id     = "expire-noncurrent"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
