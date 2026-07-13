"""Baseline seed (docs/02 §55 M1, docs/00 §6).

Idempotent — safe to re-run. Seeds: the global permission catalog, a demo tenant
with the 8 system roles wired to the docs/01 §22 matrix, the global lookup sets,
a couple of demo feature flags, and the 5 demo users (password ``Demo@1234``)
with their roles. Effective permissions are computed and cached for each user.

Run: ``make seed``  (or ``python -m seeds.seed``).
"""

from __future__ import annotations

import asyncio
from datetime import date

from sqlalchemy import select

from app.core.logging import configure_logging, get_logger
from app.core.security import hash_password
from app.modules.auth.models import User
from app.modules.auth.permissions import set_effective_permissions
from app.modules.equipment.models import Area, Equipment, Plant
from app.modules.lookups.catalog import LOOKUP_SEED
from app.modules.lookups.models import Lookup
from app.modules.tenants.models import Tenant
from app.modules.users.catalog import PERMISSIONS, SYSTEM_ROLES, permissions_for_role
from app.modules.users.models import FeatureFlag, Permission, Role
from app.modules.users.repository import RoleRepository, UserRoleRepository
from app.modules.users.service import compute_effective_permissions

log = get_logger("seeds")

TENANT_SLUG = "indusmind"
DEMO_PASSWORD = "Demo@1234"

# email → (full_name, role_name)  (docs/00 §6)
DEMO_USERS: dict[str, tuple[str, str]] = {
    "admin@indusmind.io": ("Aditi Admin", "Admin"),
    "manager@indusmind.io": ("Rajesh Manager", "Plant Manager"),
    "engineer@indusmind.io": ("Priya Engineer", "Maintenance Engineer"),
    "technician@indusmind.io": ("Arun Technician", "Field Technician"),
    "compliance@indusmind.io": ("Meena Compliance", "Compliance Officer"),
}

DEMO_FLAGS = [
    ("lessons_learned", True),
    ("predictive_maintenance", True),
    ("evidence_packages", True),
]

# ── asset seed (docs/02 §7, §23) ──────────────────────────────────────────────
# (code, name, location, timezone)
ASSET_PLANTS = [
    ("JAM", "Jamnagar Refinery", "Jamnagar, Gujarat", "Asia/Kolkata"),
    ("VAD", "Vadodara Petrochemical", "Vadodara, Gujarat", "Asia/Kolkata"),
]
# (plant_code, code, name)
ASSET_AREAS = [
    ("JAM", "CDU", "Crude Distillation Unit"),
    ("JAM", "UTIL", "Utilities"),
    ("JAM", "TANK", "Tank Farm"),
    ("VAD", "CRACK", "Cracker Unit"),
    ("VAD", "COMP", "Compressor House"),
    ("VAD", "EFF", "Effluent Treatment"),
]
# (tag, name, type, criticality, status, plant, area, manufacturer, model, health, specs, parent_tag)
ASSET_EQUIPMENT = [
    ("P-101", "Crude Feed Pump 101", "pump", "A", "operational", "JAM", "CDU", "KSB", "HGM-4-450",
     82, {"flow_m3h": 450, "head_m": 120, "power_kw": 250, "rpm": 2980, "seal": "mechanical"}, None),
    ("P-102", "Crude Feed Pump 102", "pump", "A", "standby", "JAM", "CDU", "KSB", "HGM-4-450",
     90, {"flow_m3h": 450, "head_m": 120, "power_kw": 250, "rpm": 2980, "seal": "mechanical"}, None),
    ("C-3", "Overhead Compressor 3", "compressor", "A", "operational", "JAM", "CDU", "Atlas Copco",
     "GA-315", 68, {"type": "centrifugal", "power_kw": 315, "discharge_bar": 12}, None),
    ("E-101", "Crude Preheat Exchanger", "heat_exchanger", "B", "operational", "JAM", "CDU", "Alfa Laval",
     "T20-BFG", 75, {"duty_kw": 5200, "shell_passes": 1, "tema": "AES"}, None),
    ("V-230", "Reflux Drum V-230", "tank", "B", "operational", "JAM", "CDU", "L&T",
     "PV-230", 88, {"volume_m3": 35, "design_pressure_bar": 10, "material": "CS"}, None),
    ("FUR-1", "Atmospheric Furnace 1", "boiler", "A", "operational", "JAM", "CDU", "Thermax",
     "AF-120", 71, {"duty_mmkcal": 120, "fuel": "fuel_gas", "passes": 4}, None),
    ("V-101", "Crude Column V-101", "tank", "A", "operational", "JAM", "CDU", "L&T",
     "COL-101", 79, {"trays": 42, "diameter_m": 6, "height_m": 48}, None),
    ("E-102", "Overhead Condenser", "heat_exchanger", "C", "operational", "JAM", "CDU", "Alfa Laval",
     "T15", 84, {"duty_kw": 3100}, None),
    ("TF-2", "Feed Transformer 2", "transformer", "A", "operational", "JAM", "UTIL", "Siemens",
     "GEAFOL-25", 85, {"mva": 25, "primary_kv": 66, "secondary_kv": 11, "cooling": "ONAN"}, None),
    ("TF-1", "Feed Transformer 1", "transformer", "A", "standby", "JAM", "UTIL", "Siemens",
     "GEAFOL-25", 92, {"mva": 25, "primary_kv": 66, "secondary_kv": 11, "cooling": "ONAN"}, None),
    ("P-201", "Cooling Water Pump 201", "pump", "B", "operational", "JAM", "UTIL", "Kirloskar",
     "DB-200", 77, {"flow_m3h": 2000, "head_m": 45, "power_kw": 160}, None),
    ("M-201", "Cooling Water Motor 201", "motor", "B", "operational", "JAM", "UTIL", "ABB",
     "M3BP-160", 80, {"power_kw": 160, "voltage_v": 415, "poles": 2}, "P-201"),
    ("B-1", "Utility Boiler 1", "boiler", "A", "operational", "JAM", "UTIL", "Thermax",
     "SM-120", 66, {"steam_tph": 120, "pressure_bar": 45}, None),
    ("TK-01", "Crude Storage Tank 01", "tank", "C", "operational", "JAM", "TANK", "L&T",
     "FRT-20K", 74, {"capacity_m3": 20000, "roof": "floating", "diameter_m": 48}, None),
    ("TK-02", "Crude Storage Tank 02", "tank", "C", "operational", "JAM", "TANK", "L&T",
     "FRT-20K", 81, {"capacity_m3": 20000, "roof": "floating", "diameter_m": 48}, None),
    ("FW-P1", "Firewater Pump 1", "pump", "A", "operational", "JAM", "TANK", "Kirloskar",
     "DFP-1000", 88, {"flow_m3h": 1000, "head_m": 90, "driver": "diesel", "oisd": "OISD-STD-116"}, None),
    ("C-101", "Cracked Gas Compressor 101", "compressor", "A", "operational", "VAD", "CRACK", "Siemens",
     "STC-SV", 64, {"stages": 4, "power_kw": 8000, "type": "centrifugal"}, None),
    ("V-401", "Quench Tower V-401", "tank", "B", "operational", "VAD", "CRACK", "L&T",
     "QT-401", 78, {"diameter_m": 5, "height_m": 30}, None),
    ("E-401", "Feed/Effluent Exchanger", "heat_exchanger", "B", "operational", "VAD", "CRACK", "Alfa Laval",
     "T35", 72, {"duty_kw": 9800}, None),
    ("P-401", "Quench Water Pump", "pump", "B", "operational", "VAD", "CRACK", "KSB",
     "RPH-300", 83, {"flow_m3h": 800, "head_m": 60, "power_kw": 200}, None),
    ("C-201", "Propylene Refrigeration Compressor", "compressor", "A", "operational", "VAD", "COMP",
     "MHI", "MCO-201", 70, {"power_kw": 6000, "refrigerant": "propylene"}, None),
    ("M-401", "Compressor Drive Motor 401", "motor", "A", "operational", "VAD", "COMP", "ABB",
     "AMI-6600", 76, {"power_kw": 6000, "voltage_v": 6600}, "C-201"),
    ("K-1", "Instrument Air Compressor K-1", "compressor", "B", "operational", "VAD", "COMP", "Atlas Copco",
     "GA-90", 85, {"power_kw": 90, "discharge_bar": 8}, None),
    ("P-501", "Effluent Transfer Pump 501", "pump", "C", "operational", "VAD", "EFF", "Grundfos",
     "NB-125", 68, {"flow_m3h": 300, "head_m": 30, "power_kw": 45}, None),
    ("V-501", "Neutralization Tank V-501", "tank", "C", "operational", "VAD", "EFF", "L&T",
     "NT-501", 73, {"volume_m3": 120, "material": "FRP"}, None),
]


async def _seed_permissions(session) -> dict[str, Permission]:
    existing = {p.code: p for p in (await session.execute(select(Permission))).scalars()}
    for code, resource, action, desc in PERMISSIONS:
        if code not in existing:
            perm = Permission(code=code, resource=resource, action=action, description=desc)
            session.add(perm)
            existing[code] = perm
    await session.flush()
    return existing


async def _seed_tenant(session) -> Tenant:
    tenant = (
        await session.execute(select(Tenant).where(Tenant.slug == TENANT_SLUG))
    ).scalar_one_or_none()
    if tenant is None:
        tenant = Tenant(name="IndusMind Demo", slug=TENANT_SLUG, plan="enterprise")
        session.add(tenant)
        await session.flush()
    return tenant


async def _seed_roles(session, tenant, perms: dict[str, Permission]) -> dict[str, Role]:
    repo = RoleRepository(session, tenant.id)
    roles: dict[str, Role] = {}
    for name, description in SYSTEM_ROLES:
        role = await repo.get_by_name(name)
        if role is None:
            role = Role(tenant_id=tenant.id, name=name, description=description, is_system=True)
            session.add(role)
            await session.flush()
        roles[name] = role
        codes = permissions_for_role(name)
        ids = [perms[c].id for c in codes if c in perms]
        await repo.set_permissions(role.id, ids)  # idempotent: clears + re-sets
    return roles


async def _seed_lookups(session) -> int:
    existing = {
        (row.category, row.code)
        for row in (
            await session.execute(select(Lookup).where(Lookup.tenant_id.is_(None)))
        ).scalars()
    }
    added = 0
    for category, rows in LOOKUP_SEED.items():
        for code, label, sort, meta in rows:
            if (category, code) not in existing:
                session.add(Lookup(tenant_id=None, category=category, code=code,
                                   label=label, sort=sort, meta=meta))
                added += 1
    await session.flush()
    return added


async def _seed_flags(session, tenant) -> None:
    existing = {
        f.key for f in (
            await session.execute(select(FeatureFlag).where(FeatureFlag.tenant_id == tenant.id))
        ).scalars()
    }
    for key, enabled in DEMO_FLAGS:
        if key not in existing:
            session.add(FeatureFlag(tenant_id=tenant.id, key=key, enabled=enabled))
    await session.flush()


async def _seed_users(session, tenant, roles: dict[str, Role]) -> list[User]:
    user_roles = UserRoleRepository(session)
    created: list[User] = []
    for email, (full_name, role_name) in DEMO_USERS.items():
        user = (
            await session.execute(
                select(User).where(User.tenant_id == tenant.id, User.email == email)
            )
        ).scalar_one_or_none()
        if user is None:
            user = User(tenant_id=tenant.id, email=email, full_name=full_name,
                        password_hash=hash_password(DEMO_PASSWORD), status="active")
            session.add(user)
            await session.flush()
        role = roles.get(role_name)
        if role is not None:
            await user_roles.set_roles(user.id, [role.id])
        created.append(user)
    return created


async def _seed_assets(session, tenant) -> tuple[int, int, int]:
    # equipment type code → global lookup id
    type_ids = {
        row.code: row.id
        for row in (
            await session.execute(
                select(Lookup).where(Lookup.tenant_id.is_(None), Lookup.category == "equipment_types")
            )
        ).scalars()
    }

    plants: dict[str, Plant] = {}
    for code, name, location, tz in ASSET_PLANTS:
        plant = (
            await session.execute(
                select(Plant).where(Plant.tenant_id == tenant.id, Plant.code == code)
            )
        ).scalar_one_or_none()
        if plant is None:
            plant = Plant(tenant_id=tenant.id, code=code, name=name, location=location, timezone=tz)
            session.add(plant)
            await session.flush()
        plants[code] = plant

    areas: dict[tuple[str, str], Area] = {}
    for plant_code, code, name in ASSET_AREAS:
        plant = plants[plant_code]
        area = (
            await session.execute(
                select(Area).where(Area.tenant_id == tenant.id, Area.plant_id == plant.id,
                                   Area.code == code)
            )
        ).scalar_one_or_none()
        if area is None:
            area = Area(tenant_id=tenant.id, plant_id=plant.id, code=code, name=name)
            session.add(area)
            await session.flush()
        areas[(plant_code, code)] = area

    equipment: dict[str, Equipment] = {}
    parents: dict[str, str] = {}
    for (tag, name, type_code, crit, status, plant_code, area_code, mfr, model,
         health, specs, parent_tag) in ASSET_EQUIPMENT:
        eq = (
            await session.execute(
                select(Equipment).where(Equipment.tenant_id == tenant.id, Equipment.tag == tag)
            )
        ).scalar_one_or_none()
        if eq is None:
            eq = Equipment(
                tenant_id=tenant.id, plant_id=plants[plant_code].id,
                area_id=areas[(plant_code, area_code)].id, tag=tag, name=name,
                type_id=type_ids.get(type_code), criticality=crit, status=status,
                manufacturer=mfr, model=model, install_date=date(2019, 1, 1),
                specs=specs, health_score=health)
            session.add(eq)
            await session.flush()
        equipment[tag] = eq
        if parent_tag:
            parents[tag] = parent_tag

    for child_tag, parent_tag in parents.items():
        child = equipment[child_tag]
        if child.parent_id is None and parent_tag in equipment:
            child.parent_id = equipment[parent_tag].id
    await session.flush()
    return len(plants), len(areas), len(equipment)


async def _seed_documents(session, tenant, admin_user) -> int:
    """Generate → upload → ingest the sample corpus (docs/02 §10, §55)."""
    import asyncio as _asyncio
    import hashlib
    from datetime import UTC, datetime

    from app.core import storage
    from app.modules.documents.models import Document, DocumentVersion, IngestionJob
    from app.modules.documents.service import PIPELINE_STAGES
    from app.modules.ingestion.pipeline import run_pipeline
    from seeds.sample_data import SAMPLES, generate_pdf

    types = {
        row.code: row.id
        for row in (
            await session.execute(
                select(Lookup).where(Lookup.tenant_id.is_(None), Lookup.category == "doc_types")
            )
        ).scalars()
    }
    ingested = 0
    for filename, type_code, title, tags, paras in SAMPLES:
        existing = (
            await session.execute(
                select(Document).where(Document.tenant_id == tenant.id, Document.title == title)
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue
        data = generate_pdf(title, paras)
        checksum = hashlib.sha256(data).hexdigest()
        doc = Document(tenant_id=tenant.id, title=title, doc_type_id=types.get(type_code),
                       source="upload", mime="application/pdf", storage_key="",
                       size_bytes=len(data), checksum=checksum, tags=tags,
                       ingestion_status="pending", uploaded_by=admin_user.id,
                       created_by=admin_user.id, updated_by=admin_user.id)
        session.add(doc)
        await session.flush()
        key = storage.document_key(str(tenant.id), str(doc.id), 1, filename)
        doc.storage_key = key
        version = DocumentVersion(tenant_id=tenant.id, document_id=doc.id, version_no=1,
                                  storage_key=key, mime="application/pdf", size_bytes=len(data),
                                  checksum=checksum, confirmed_at=datetime.now(UTC))
        session.add(version)
        await session.flush()
        doc.current_version_id = version.id
        stages = [{"stage": s, "status": "pending", "started": None, "finished": None,
                   "detail": None} for s in PIPELINE_STAGES]
        session.add(IngestionJob(tenant_id=tenant.id, document_id=doc.id, version_id=version.id,
                                 status="pending", stages=stages))
        await session.flush()
        await _asyncio.to_thread(storage.put_object, key, data, "application/pdf")
        await run_pipeline(session, tenant.id, doc.id)
        ingested += 1
    await session.flush()
    return ingested


async def run(*, with_documents: bool = False) -> None:
    # Document ingestion (needs MinIO + pipeline deps) is opt-in so unit tests that
    # only need the config/asset seed stay fast; `make seed` enables it below.
    from app.core.database import SessionFactory

    log.info("seed_start")
    async with SessionFactory() as session:
        perms = await _seed_permissions(session)
        tenant = await _seed_tenant(session)
        roles = await _seed_roles(session, tenant, perms)
        added_lookups = await _seed_lookups(session)
        await _seed_flags(session, tenant)
        users = await _seed_users(session, tenant, roles)
        n_plants, n_areas, n_equipment = await _seed_assets(session, tenant)
        admin = next((u for u in users if u.email == "admin@indusmind.io"), users[0])
        n_docs = await _seed_documents(session, tenant, admin) if with_documents else 0
        await session.commit()

        # Warm the effective-permission cache for every demo user.
        for user in users:
            eff = await compute_effective_permissions(session, tenant.id, user.id)
            await set_effective_permissions(tenant.id, user.id, eff)

    log.info("seed_done", permissions=len(perms), roles=len(roles), lookups_added=added_lookups,
             users=len(users), plants=n_plants, areas=n_areas, equipment=n_equipment, documents=n_docs)
    print(f"Seeded: {len(perms)} permissions, {len(roles)} roles, {added_lookups} lookups added, "
          f"{len(users)} demo users, {n_plants} plants, {n_areas} areas, {n_equipment} equipment, "
          f"{n_docs} documents ingested (password {DEMO_PASSWORD}).")


if __name__ == "__main__":
    import os

    configure_logging("INFO")
    # `make seed` ingests the sample corpus; set SEED_DOCUMENTS=0 to skip.
    asyncio.run(run(with_documents=os.getenv("SEED_DOCUMENTS", "1") != "0"))
