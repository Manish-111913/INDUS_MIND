# Terraform + provider pinning (docs/02 §48 — AWS prod option A).
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state is configured per-environment. Left as a partial config so
  # `terraform init -backend=false` works for `validate` in CI; supply a real
  # backend with `-backend-config` (S3 bucket + DynamoDB lock table) on apply.
  # TODO(prod): point this at your state bucket.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
