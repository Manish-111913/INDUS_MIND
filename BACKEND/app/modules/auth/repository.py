"""Auth repositories: users, sessions, refresh tokens (docs/02 §6, §7)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import PasswordResetToken, RefreshToken, Session, User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, user_id: uuid.UUID | str) -> User | None:
        stmt = select(User).where(User.id == user_id, User.deleted_at.is_(None))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_by_email(self, tenant_id: uuid.UUID | str | None, email: str) -> User | None:
        stmt = select(User).where(func.lower(User.email) == email.lower(), User.deleted_at.is_(None))
        if tenant_id is not None:
            stmt = stmt.where(User.tenant_id == tenant_id)
        return (await self.session.execute(stmt)).scalars().first()

    async def add(self, user: User) -> User:
        self.session.add(user)
        await self.session.flush()
        return user

    async def bump_token_version(self, user_id: uuid.UUID | str) -> None:
        await self.session.execute(
            update(User).where(User.id == user_id).values(token_version=User.token_version + 1)
        )


class SessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, row: Session) -> Session:
        self.session.add(row)
        await self.session.flush()
        return row

    async def get(self, session_id: uuid.UUID | str) -> Session | None:
        return (
            await self.session.execute(select(Session).where(Session.id == session_id))
        ).scalar_one_or_none()

    async def list_active_for_user(self, user_id: uuid.UUID | str) -> list[Session]:
        stmt = (
            select(Session)
            .where(Session.user_id == user_id, Session.revoked_at.is_(None))
            .order_by(Session.created_at.desc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def revoke(self, session_id: uuid.UUID | str) -> None:
        await self.session.execute(
            update(Session)
            .where(Session.id == session_id, Session.revoked_at.is_(None))
            .values(revoked_at=func.now())
        )

    async def revoke_all_for_user(self, user_id: uuid.UUID | str) -> None:
        await self.session.execute(
            update(Session)
            .where(Session.user_id == user_id, Session.revoked_at.is_(None))
            .values(revoked_at=func.now())
        )

    async def touch(self, session_id: uuid.UUID | str) -> None:
        await self.session.execute(
            update(Session).where(Session.id == session_id).values(last_seen_at=func.now())
        )


class RefreshTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, row: RefreshToken) -> RefreshToken:
        self.session.add(row)
        await self.session.flush()
        return row

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def revoke_one(self, token_id: uuid.UUID | str) -> None:
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.id == token_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=func.now())
        )

    async def revoke_family(self, family_id: uuid.UUID | str) -> None:
        """Reuse-detection / logout hammer: kill every token in the family."""
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=func.now())
        )

    async def revoke_by_session(self, session_id: uuid.UUID | str) -> None:
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.session_id == session_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=func.now())
        )

    async def revoke_all_for_user(self, user_id: uuid.UUID | str) -> None:
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=func.now())
        )


class PasswordResetTokenRepository:
    """Single-use, TTL-bounded reset tokens stored by SHA-256 hash (docs/08 N1)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, *, user_id: uuid.UUID | str, token_hash: str, expires_at) -> PasswordResetToken:
        row = PasswordResetToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        self.session.add(row)
        await self.session.flush()
        return row

    async def get_by_hash(self, token_hash: str) -> PasswordResetToken | None:
        stmt = select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def mark_used(self, token_id: uuid.UUID | str) -> None:
        await self.session.execute(
            update(PasswordResetToken)
            .where(PasswordResetToken.id == token_id, PasswordResetToken.used_at.is_(None))
            .values(used_at=func.now())
        )

    async def invalidate_user_tokens(self, user_id: uuid.UUID | str) -> None:
        """Void any outstanding tokens for a user — issuing a new one, or a
        successful reset, should leave no other live token to redeem."""
        await self.session.execute(
            update(PasswordResetToken)
            .where(PasswordResetToken.user_id == user_id, PasswordResetToken.used_at.is_(None))
            .values(used_at=func.now())
        )
