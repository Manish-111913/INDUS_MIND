# Input variables (docs/02 §48). Account-specific values live in a tfvars file
# (see terraform.tfvars.example) or -var flags; nothing sensitive is committed.

variable "project" {
  description = "Project name, used as a resource name prefix and tag."
  type        = string
  default     = "indusmind"
}

variable "environment" {
  description = "Deployment environment (staging | prod)."
  type        = string
  default     = "prod"
}

variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-south-1"
}

variable "azs" {
  description = "Availability zones (2 for the §48 layout)."
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.20.0.0/16"
}

# ── data plane sizing ─────────────────────────────────────────────────────────
variable "db_instance_class" {
  description = "RDS Postgres instance class."
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage (GiB)."
  type        = number
  default     = 50
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type."
  type        = string
  default     = "cache.t3.small"
}

# ── application / containers ──────────────────────────────────────────────────
variable "api_image" {
  description = "Full ECR image ref for the API service (repo:tag)."
  type        = string
  default     = "" # TODO(prod): set to the pushed ECR image, e.g. <acct>.dkr.ecr.<region>.amazonaws.com/indusmind-api:<sha>
}

variable "worker_image" {
  description = "Full ECR image ref for the worker/beat services."
  type        = string
  default     = "" # TODO(prod): set to the pushed ECR worker image.
}

variable "api_desired_count" {
  description = "Number of API tasks (§48: 2×)."
  type        = number
  default     = 2
}

variable "worker_desired_count" {
  description = "Number of worker tasks (§48: 2×)."
  type        = number
  default     = 2
}

variable "api_cpu" {
  description = "API task CPU units (1024 = 1 vCPU)."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "API task memory (MiB)."
  type        = number
  default     = 1024
}

variable "worker_cpu" {
  description = "Worker task CPU units."
  type        = number
  default     = 1024
}

variable "worker_memory" {
  description = "Worker task memory (MiB)."
  type        = number
  default     = 2048
}

# ── edge ──────────────────────────────────────────────────────────────────────
variable "acm_certificate_arn" {
  description = "ACM cert ARN for the ALB HTTPS listener."
  type        = string
  default     = "" # TODO(prod): ARN of the api.<domain> certificate.
}

variable "cors_origins" {
  description = "Comma-separated allowed CORS origins for the API."
  type        = string
  default     = "https://app.indusmind.example"
}
