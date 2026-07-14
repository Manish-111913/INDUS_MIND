# IAM for ECS tasks (docs/02 §48). Execution role pulls images + reads the
# task's secrets/logs; task role is what the app assumes at runtime (S3 + Bedrock
# + Secrets read). Least-privilege scoped to this deployment's resources.

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ── execution role ────────────────────────────────────────────────────────────
resource "aws_iam_role" "execution" {
  name               = "${local.name}-ecs-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_extra" {
  statement {
    sid       = "ReadTaskSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.db.arn, aws_secretsmanager_secret.app.arn]
  }
  statement {
    sid       = "DecryptWithKms"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.main.arn]
  }
}

resource "aws_iam_role_policy" "execution_extra" {
  name   = "${local.name}-exec-extra"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_extra.json
}

# ── task (runtime) role ───────────────────────────────────────────────────────
resource "aws_iam_role" "task" {
  name               = "${local.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "task" {
  statement {
    sid       = "DocumentsBucket"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.docs.arn, "${aws_s3_bucket.docs.arn}/*"]
  }
  statement {
    sid       = "KmsForS3"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.main.arn]
  }
  statement {
    sid       = "BedrockInvoke"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["*"] # Bedrock model ARNs are region/account-scoped; tighten per model in prod.
  }
  statement {
    sid       = "TextractOcr"
    actions   = ["textract:AnalyzeDocument", "textract:DetectDocumentText"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "task" {
  name   = "${local.name}-task"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}
