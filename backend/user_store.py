"""Server-side user registry and admin analytics helpers."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

DATA_DIR = Path(
    os.getenv("ENGINUITY_DATA_DIR") or (Path(__file__).resolve().parent / "data")
)
USERS_FILE = DATA_DIR / "users.json"
FEEDBACK_FILE = DATA_DIR / "beta_feedback.jsonl"
ACTIVITY_FILE = DATA_DIR / "activity_events.jsonl"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def admin_emails() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS", "ndumela.bonolo@gmail.com")
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def _read_users_doc() -> Dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not USERS_FILE.exists():
        return {"users": {}}
    try:
        data = json.loads(USERS_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("users"), dict):
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return {"users": {}}


def _write_users_doc(doc: Dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    USERS_FILE.write_text(
        json.dumps(doc, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def is_guest_id(value: str) -> bool:
    return normalize_email(value).startswith("guest-")


def _linked_guest_ids(user: Optional[Dict[str, Any]]) -> List[str]:
    if not user:
        return []
    values = user.get("linked_guest_ids") or []
    out: List[str] = []
    for item in values:
        key = normalize_email(str(item))
        if key and key not in out:
            out.append(key)
    return out


def _earlier_ts(left: str, right: str) -> str:
    left_dt = _parse_ts(left)
    right_dt = _parse_ts(right)
    if left_dt and right_dt:
        return left if left_dt <= right_dt else right
    return left or right


def _rewrite_jsonl_identity(path: Path, old_id: str, new_id: str, field: str) -> None:
    if not path.exists():
        return
    old_key = normalize_email(old_id)
    new_key = normalize_email(new_id)
    if not old_key or not new_key or old_key == new_key:
        return
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    rewritten: List[str] = []
    changed = False
    for line in lines:
        raw = line.strip()
        if not raw:
            continue
        try:
            record = json.loads(raw)
        except json.JSONDecodeError:
            rewritten.append(line)
            continue
        if normalize_email(str(record.get(field) or "")) == old_key:
            record[field] = new_key
            record["merged_from_guest"] = old_key
            changed = True
        rewritten.append(json.dumps(record, ensure_ascii=False))
    if changed:
        path.write_text("\n".join(rewritten) + "\n", encoding="utf-8")


def resolve_user_key(identifier: str) -> str:
    key = normalize_email(identifier)
    if not key:
        return ""
    users = _read_users_doc().get("users", {})
    if key in users and not is_guest_id(key):
        return key
    for email, user in users.items():
        if is_guest_id(str(email)):
            continue
        if key in _linked_guest_ids(user):
            return normalize_email(str(email))
    return key


def merge_guest_into_signed_user(email: str, guest_id: str) -> Optional[Dict[str, Any]]:
    email_key = normalize_email(email)
    guest_key = normalize_email(guest_id)
    if not email_key or not guest_key or is_guest_id(email_key) or not is_guest_id(guest_key):
        return None
    if email_key == guest_key:
        return None

    doc = _read_users_doc()
    users = doc.setdefault("users", {})
    for other_email, other in users.items():
        other_key = normalize_email(str(other_email))
        if other_key in (email_key, guest_key) or is_guest_id(other_key):
            continue
        if guest_key in _linked_guest_ids(other):
            return users.get(email_key)

    guest = users.get(guest_key) or {}
    signed = users.get(email_key) or {}
    now = utc_now()
    linked = _linked_guest_ids(signed)
    if guest_key not in linked:
        linked.append(guest_key)
    for extra in _linked_guest_ids(guest):
        if extra not in linked:
            linked.append(extra)

    guest_prefs = dict(guest.get("preferences") or {})
    signed_prefs = dict(signed.get("preferences") or {})
    merged_preferences = dict(guest_prefs)
    merged_preferences.update(signed_prefs)

    signed_name = str(signed.get("name") or "").strip()
    guest_name = str(guest.get("name") or "").strip()
    display_name = signed_name
    if not display_name or display_name.lower() == "guest":
        display_name = guest_name if guest_name.lower() != "guest" else signed_name or guest_name

    merged = {
        "id": signed.get("id") or guest.get("id") or str(uuid.uuid4()),
        "name": display_name,
        "email": email_key,
        "account_type": "signed_in",
        "role": resolve_role(email_key, signed.get("role") or guest.get("role")),
        "plan": (
            (signed.get("plan") if str(signed.get("plan") or "free").lower() != "free" else None)
            or (guest.get("plan") if str(guest.get("plan") or "free").lower() != "free" else None)
            or signed.get("plan")
            or guest.get("plan")
            or "free"
        ),
        "created_at": _earlier_ts(str(signed.get("created_at") or ""), str(guest.get("created_at") or "")) or now,
        "last_activity": now,
        "sessions_completed": int(signed.get("sessions_completed", 0) or 0)
        + int(guest.get("sessions_completed", 0) or 0),
        "preferences": merged_preferences,
        "linked_guest_ids": linked,
    }
    users[email_key] = merged
    if guest_key in users:
        del users[guest_key]
    _write_users_doc(doc)
    _rewrite_jsonl_identity(FEEDBACK_FILE, guest_key, email_key, "user_id")
    _rewrite_jsonl_identity(ACTIVITY_FILE, guest_key, email_key, "email")
    return merged


def resolve_role(email: str, existing_role: Optional[str] = None) -> str:
    if normalize_email(email) in admin_emails():
        return "admin"
    if existing_role == "admin":
        return "admin"
    return existing_role or "user"


def sync_user(
    email: str,
    name: str = "",
    plan: str = "free",
    *,
    increment_sessions: int = 0,
    preferences: Optional[Dict[str, Any]] = None,
    guest_id: str = "",
) -> Dict[str, Any]:
    email_key = normalize_email(email)
    guest_key = normalize_email(guest_id)
    if email_key and is_guest_id(email_key) and not guest_key:
        guest_key = email_key
        email_key = ""

    if email_key and guest_key and is_guest_id(guest_key):
        merge_guest_into_signed_user(email_key, guest_key)

    key = email_key or resolve_user_key(guest_key)
    if not key:
        raise ValueError("email is required")

    doc = _read_users_doc()
    users = doc.setdefault("users", {})
    existing = users.get(key, {})
    now = utc_now()

    sessions = int(existing.get("sessions_completed", 0) or 0)
    sessions += max(0, increment_sessions)

    merged_preferences = dict(existing.get("preferences") or {})
    if isinstance(preferences, dict):
        for pref_key, pref_value in preferences.items():
            if pref_value is not None:
                merged_preferences[pref_key] = pref_value

    display_name = (name or existing.get("name") or "").strip()
    if not display_name and is_guest_id(key):
        display_name = "Guest"

    linked = _linked_guest_ids(existing)
    if guest_key and is_guest_id(guest_key) and not is_guest_id(key) and guest_key not in linked:
        linked.append(guest_key)

    user = {
        "id": existing.get("id") or str(uuid.uuid4()),
        "name": display_name,
        "email": key,
        "account_type": "guest" if is_guest_id(key) else "signed_in",
        "role": resolve_role(key, existing.get("role")),
        "plan": (plan or existing.get("plan") or "free").strip() or "free",
        "created_at": existing.get("created_at") or now,
        "last_activity": now,
        "sessions_completed": sessions,
        "preferences": merged_preferences,
        "linked_guest_ids": linked,
    }
    users[key] = user
    _write_users_doc(doc)
    return user


def update_user_preferences(email: str, preferences: Dict[str, Any]) -> Dict[str, Any]:
    key = normalize_email(email)
    if not key:
        raise ValueError("email is required")
    if not isinstance(preferences, dict):
        raise ValueError("preferences must be an object")

    doc = _read_users_doc()
    users = doc.setdefault("users", {})
    existing = users.get(key) or sync_user(key, plan="free")
    merged = dict(existing.get("preferences") or {})
    merged.update(preferences)
    existing["preferences"] = merged
    existing["last_activity"] = utc_now()
    users[key] = existing
    _write_users_doc(doc)
    return existing


def touch_activity(email: str, event_type: str = "activity", metadata: Optional[dict] = None) -> Optional[Dict[str, Any]]:
    key = resolve_user_key(email)
    if not key:
        return None

    doc = _read_users_doc()
    users = doc.setdefault("users", {})
    existing = users.get(key)
    now = utc_now()

    if existing:
        existing["last_activity"] = now
        users[key] = existing
        _write_users_doc(doc)
    else:
        existing = sync_user(key, plan="free")

    record = {
        "email": key,
        "event_type": (event_type or "activity").strip() or "activity",
        "timestamp": now,
        "metadata": metadata or {},
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with ACTIVITY_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    return existing


def get_user(email: str) -> Optional[Dict[str, Any]]:
    key = resolve_user_key(email)
    if not key:
        return None
    return _read_users_doc().get("users", {}).get(key)


def is_admin(email: str) -> bool:
    key = normalize_email(email)
    if not key:
        return False
    if key in admin_emails():
        return True
    user = get_user(key)
    return bool(user and user.get("role") == "admin")


def list_users() -> List[Dict[str, Any]]:
    users_map = _read_users_doc().get("users", {})
    linked = set()
    for user in users_map.values():
        linked.update(_linked_guest_ids(user))
    users = [
        item
        for key, item in users_map.items()
        if normalize_email(str(key)) not in linked
    ]
    users.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return users


def append_feedback(record: Dict[str, Any]) -> Dict[str, Any]:
    user_id = resolve_user_key(str(record.get("user_id") or "").strip())
    if user_id:
        record["user_id"] = user_id
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with FEEDBACK_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    if user_id and user_id.lower() != "anonymous":
        session_type = str(record.get("session_type") or "")
        sync_user(user_id, increment_sessions=1)
        touch_activity(user_id, "session_complete", {"mode": session_type})
    return record


def read_feedback_records() -> List[Dict[str, Any]]:
    if not FEEDBACK_FILE.exists():
        return []
    records: List[Dict[str, Any]] = []
    try:
        for line in FEEDBACK_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    except OSError:
        return []
    records.sort(key=lambda item: item.get("timestamp", ""), reverse=True)
    return records


def read_activity_events(limit: int = 500) -> List[Dict[str, Any]]:
    if not ACTIVITY_FILE.exists():
        return []
    events: List[Dict[str, Any]] = []
    try:
        lines = ACTIVITY_FILE.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    for line in lines[-limit:]:
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def _parse_ts(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def get_overview_stats() -> Dict[str, Any]:
    users = list_users()
    feedback = read_feedback_records()
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    active_beta_users = 0
    upgrade_conversions = 0
    for user in users:
        last = _parse_ts(str(user.get("last_activity", "")))
        if last and last >= week_ago:
            active_beta_users += 1
        plan = str(user.get("plan", "free")).lower()
        if plan and plan != "free":
            upgrade_conversions += 1

    ratings = [int(item.get("rating", 0)) for item in feedback if int(item.get("rating", 0) or 0) > 0]
    avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else 0.0

    sessions_completed = sum(int(user.get("sessions_completed", 0) or 0) for user in users)

    return {
        "total_users": len(users),
        "active_beta_users": active_beta_users,
        "total_feedback": len(feedback),
        "average_feedback_rating": avg_rating,
        "total_sessions_completed": sessions_completed,
        "upgrade_conversions": upgrade_conversions,
    }


def get_analytics_snapshot() -> Dict[str, Any]:
    users = list_users()
    feedback = read_feedback_records()
    events = read_activity_events()

    feature_counts: Dict[str, int] = {}
    for event in events:
        mode = str((event.get("metadata") or {}).get("mode") or event.get("event_type") or "activity")
        feature_counts[mode] = feature_counts.get(mode, 0) + 1

    # Session types from feedback
    for item in feedback:
        session_type = str(item.get("session_type") or "Associate")
        feature_counts[session_type] = feature_counts.get(session_type, 0) + 1

    most_used = sorted(feature_counts.items(), key=lambda pair: pair[1], reverse=True)[:5]
    most_used_features = [{"feature": name, "count": count} for name, count in most_used]

    total_users = len(users) or 1
    active_recent = get_overview_stats()["active_beta_users"]
    retention_rate = round((active_recent / total_users) * 100, 1) if total_users else 0.0

    users_with_sessions = sum(1 for user in users if int(user.get("sessions_completed", 0) or 0) > 0)
    completion_rate = round((users_with_sessions / total_users) * 100, 1) if total_users else 0.0

    return {
        "daily_active_users": active_recent,
        "most_used_features": most_used_features,
        "session_completion_rate": completion_rate,
        "user_retention": retention_rate,
        "usage_statistics": {
            "registered_users": len(users),
            "feedback_submissions": len(feedback),
            "tracked_events": len(events),
        },
    }


def get_payments_snapshot() -> Dict[str, Any]:
    users = list_users()
    active_subscriptions = [
        {
            "email": user.get("email"),
            "name": user.get("name"),
            "plan": user.get("plan", "free"),
            "since": user.get("created_at"),
        }
        for user in users
        if str(user.get("plan", "free")).lower() != "free"
    ]

    return {
        "active_subscriptions": active_subscriptions,
        "upgrade_conversions": len(active_subscriptions),
        "revenue_tracking": {
            "status": "pending_integration",
            "message": "Stripe payment integration is planned after Beta.",
            "mrr_estimate": 0,
        },
        "payment_history": [],
    }


def get_settings_snapshot() -> Dict[str, Any]:
    return {
        "platform_name": "Spark",
        "beta_mode": True,
        "admin_accounts_configured": len(admin_emails()),
        "feedback_storage": str(FEEDBACK_FILE),
        "user_storage": str(USERS_FILE),
        "data_dir": str(DATA_DIR),
    }
