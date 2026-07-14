# Security groups (docs/02 §39, §47 — network policies: api→DB only).
# ALB → app (8000) → RDS (5432) / Redis (6379). Each tier only accepts from the
# one in front of it; egress is open so tasks can reach ECR/Secrets/LLM APIs.

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public ALB — HTTPS in from the internet."
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTP (redirects to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${local.name}-alb-sg" }
}

resource "aws_security_group" "app" {
  name        = "${local.name}-app"
  description = "ECS tasks (api/worker/beat)."
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "API port from ALB only"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${local.name}-app-sg" }
}

resource "aws_security_group" "db" {
  name        = "${local.name}-db"
  description = "RDS Postgres — reachable from app tasks only."
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from app"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  tags = { Name = "${local.name}-db-sg" }
}

resource "aws_security_group" "redis" {
  name        = "${local.name}-redis"
  description = "ElastiCache Redis — reachable from app tasks only."
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from app"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  tags = { Name = "${local.name}-redis-sg" }
}
