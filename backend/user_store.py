"""Server-side user registry and admin analytics helpers."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

DATA_DIR = Path(__file__).resolve().parent / "data"
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
) -> Dict[str, Any]:
    key = normalize_email(email)
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

    user = {
        "id": existing.get("id") or str(uuid.uuid4()),
        "name": (name or existing.get("name") or "").strip(),
        "email": key,
        "role": resolve_role(key, existing.get("role")),
        "plan": (plan or existing.get("plan") or "free").strip() or "free",
        "created_at": existing.get("created_at") or now,
        "last_activity": now,
        "sessions_completed": sessions,
        "preferences": merged_preferences,
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
    key = normalize_email(email)
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
    key = normalize_email(email)
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
    users = list(_read_users_doc().get("users", {}).values())
    users.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return users


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
        "feedback_storage": "beta_feedback.jsonl",
        "user_storage": "users.json",
    }
