"""Backend i18n (docs/08 S9).

locales · translations · translation_gaps. `GET /i18n/{locale}/{namespace}`
serves bundles with an ETag + Redis cache and an `en` fallback; every missed key
is logged to translation_gaps so admins can see what's untranslated.
"""
