# Secrets Manager (docs/02 §43): DB creds + app secrets injected into ECS tasks
# as environment at task start. Rotation-ready (RDS-managed rotation can be
# attached to the db secret). Placeholder values are set here so `apply` succeeds;
# real JWT/LLM/OAuth secrets are written out-of-band (console/CLI) or by a
# rotation lambda — never committed.

resource "aws_secretsmanager_secret" "db" {
  name        = "${local.name}/database-url"
  description = "asyncpg DATABASE_URL for the app"
  kms_key_id  = aws_kms_key.main.arn
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = format(
    "postgresql+asyncpg://%s:%s@%s/%s",
    aws_db_instance.main.username,
    random_password.db.result,
    aws_db_instance.main.endpoint,
    aws_db_instance.main.db_name,
  )
}

# App secret bundle (JWT keys, LLM API keys, OAuth secrets, SECRET_KEY).
# Seeded with placeholders; overwrite the value post-apply with the real bundle.
resource "aws_secretsmanager_secret" "app" {
  name        = "${local.name}/app"
  description = "SECRET_KEY, JWT_PRIVATE_KEY/PUBLIC_KEY, ANTHROPIC_API_KEY, OAUTH_* (docs/02 §49)"
  kms_key_id  = aws_kms_key.main.arn
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    SECRET_KEY                 = "TODO-overwrite-after-apply"
    JWT_PRIVATE_KEY            = "TODO-overwrite-after-apply"
    JWT_PUBLIC_KEY             = "TODO-overwrite-after-apply"
    ANTHROPIC_API_KEY          = "TODO-overwrite-after-apply"
    OAUTH_GOOGLE_CLIENT_ID     = "TODO-overwrite-after-apply"
    OAUTH_GOOGLE_CLIENT_SECRET = "TODO-overwrite-after-apply"
  })

  lifecycle {
    # Don't clobber the real values once an operator has written them.
    ignore_changes = [secret_string]
  }
}
