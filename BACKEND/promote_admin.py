"""One-shot script: promote a user to Admin role AND rebuild their permission cache.
Run from the BACKEND directory with the venv active:
    python promote_admin.py manishcse2006@gmail.com
"""
import asyncio
import sys

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.redis import get_redis, close_redis
from app.modules.users.models import Role, UserRole
from app.modules.auth.models import User
from app.modules.auth.permissions import set_effective_permissions, invalidate_permissions
from app.modules.users.service import compute_effective_permissions


async def promote(email: str) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    await get_redis()  # initialise the lazy client

    async with async_session() as session:
        # Find the user
        user = (await session.execute(
            select(User).where(User.email == email)
        )).scalar_one_or_none()
        if not user:
            print(f"ERROR: No user found with email '{email}'")
            return

        # Find the Admin role in the same tenant
        admin_role = (await session.execute(
            select(Role).where(Role.tenant_id == user.tenant_id, Role.name == "Admin")
        )).scalar_one_or_none()
        if not admin_role:
            print("ERROR: 'Admin' role not found in the tenant. Check seeded roles.")
            return

        # Remove existing roles and assign Admin
        await session.execute(
            delete(UserRole).where(UserRole.user_id == user.id)
        )
        session.add(UserRole(user_id=user.id, role_id=admin_role.id))
        await session.flush()

        # Recompute and cache the effective permissions immediately
        # so the next login token carries the correct perm_hash.
        perms = await compute_effective_permissions(session, user.tenant_id, user.id)
        await set_effective_permissions(user.tenant_id, user.id, perms)
        await session.commit()

        print(f"SUCCESS: '{email}' promoted to Admin")
        print(f"  role_id  : {admin_role.id}")
        print(f"  user_id  : {user.id}")
        print(f"  perms    : {len(perms)} permissions cached in Redis")
        print("")
        print("ACTION REQUIRED: Log out and log back in to get a fresh JWT.")

    await close_redis()
    await engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python promote_admin.py <email>")
        sys.exit(1)
    asyncio.run(promote(sys.argv[1]))
