"""Notifications module (docs/02 §7, §20, §34).

Event-driven: an event-bus subscriber consumes typed domain events, resolves
DB-configured routing rules (event_type → category, priority, audience) and fans
the notification out per channel (in_app row + WS `notification.new`, email via
SMTP/mailhog, push stub). User preferences gate email/push per category.
"""
