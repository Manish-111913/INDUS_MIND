# CloudWatch alarms (docs/02 §29): error rate + p95 latency on the ALB, plus a
# free-storage alarm on RDS. Notifications fan out via SNS (wire email/Slack/
# PagerDuty subscriptions per environment).

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.name}-alb-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10 # >~2% of a moderate request rate (docs/02 §29)
  treat_missing_data  = "notBreaching"
  alarm_description   = "API 5XX responses elevated"
  dimensions          = { LoadBalancer = aws_lb.api.arn_suffix }
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "alb_p95_latency" {
  alarm_name          = "${local.name}-alb-p95-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  extended_statistic  = "p95"
  threshold           = 2 # p95 > 2s (docs/02 §29)
  treat_missing_data  = "notBreaching"
  alarm_description   = "API p95 latency above 2s"
  dimensions          = { LoadBalancer = aws_lb.api.arn_suffix }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${local.name}-rds-free-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 5368709120 # 5 GiB
  treat_missing_data  = "notBreaching"
  alarm_description   = "RDS free storage below 5 GiB"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
