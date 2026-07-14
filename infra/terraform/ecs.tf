# ECS Fargate cluster + services (docs/02 §48): api (2×, behind ALB), worker
# (2×, Celery), beat (1×, scheduler). All in private subnets; secrets injected
# from Secrets Manager; logs to CloudWatch.

resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.main.arn
}

locals {
  # Non-secret env shared by every task (docs/02 §7, §49).
  common_env = [
    { name = "APP_ENV", value = var.environment },
    { name = "REDIS_URL", value = "redis://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379/0" },
    { name = "S3_BUCKET", value = aws_s3_bucket.docs.bucket },
    { name = "AWS_REGION", value = var.region },
    { name = "CORS_ORIGINS", value = var.cors_origins },
    { name = "LLM_PROVIDER", value = "anthropic" },
    { name = "RATE_LIMIT_ENABLED", value = "true" },
    { name = "LOG_LEVEL", value = "INFO" },
  ]
  # Secret env pulled from Secrets Manager at task start.
  common_secrets = [
    { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db.arn },
    { name = "SECRET_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:SECRET_KEY::" },
    { name = "JWT_PRIVATE_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:JWT_PRIVATE_KEY::" },
    { name = "JWT_PUBLIC_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:JWT_PUBLIC_KEY::" },
    { name = "ANTHROPIC_API_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:ANTHROPIC_API_KEY::" },
  ]
}

# ── API task + service ────────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.api_cpu)
  memory                   = tostring(var.api_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name         = "api"
    image        = var.api_image
    essential    = true
    command      = ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
    portMappings = [{ containerPort = 8000, protocol = "tcp" }]
    environment  = local.common_env
    secrets      = local.common_secrets
    healthCheck = {
      command  = ["CMD-SHELL", "python -c \"import urllib.request;urllib.request.urlopen('http://localhost:8000/healthz')\""]
      interval = 30, timeout = 5, retries = 3, startPeriod = 30
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "${local.name}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.app.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8000
  }

  # Blue/green safety: roll back automatically on failed deploys (§56).
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.https]
}

# ── Worker task + service (Celery) ────────────────────────────────────────────
resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.worker_cpu)
  memory                   = tostring(var.worker_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name        = "worker"
    image       = var.worker_image
    essential   = true
    command     = ["celery", "-A", "app.workers.celery_app.celery", "worker", "--loglevel=INFO", "-Q", "ingestion,ai,notify,scheduled,default"]
    environment = local.common_env
    secrets     = local.common_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])
}

resource "aws_ecs_service" "worker" {
  name            = "${local.name}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.app.id]
  }
}

# ── Beat task + service (scheduler, single replica) ───────────────────────────
resource "aws_ecs_task_definition" "beat" {
  family                   = "${local.name}-beat"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name        = "beat"
    image       = var.worker_image
    essential   = true
    command     = ["celery", "-A", "app.workers.celery_app.celery", "beat", "--loglevel=INFO"]
    environment = local.common_env
    secrets     = local.common_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "beat"
      }
    }
  }])
}

resource "aws_ecs_service" "beat" {
  name            = "${local.name}-beat"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.beat.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.app.id]
  }
}
