# infra/

Production infrastructure for IndusMind (docs/02 §48 — AWS prod option A).

| Path | What |
|---|---|
| [`terraform/`](./terraform) | Terraform for the full AWS layout — VPC (2 AZ, public/private/isolated), ECS Fargate (api ×2, worker ×2, beat ×1), RDS Postgres 16 Multi-AZ (pgvector), ElastiCache Redis, S3 (versioned + lifecycle), Secrets Manager, ECR, ALB, CloudWatch alarms, KMS. |
| [`PRODUCTION.md`](./PRODUCTION.md) | Deploy runbook: provision → build/push images → one-off migration task → deploy → smoke; env-var mapping (local→AWS); DR runbook (RPO ≤ 15 min / RTO ≤ 4 h). |

**Status:** `terraform validate`-clean skeleton modelling the real topology; not
yet applied to a live account. `TODO(prod)` markers flag account-specific values
(image tags, ACM cert ARN, domain). Validate locally:

```bash
cd terraform
terraform init -backend=false
terraform validate
```
