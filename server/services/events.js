import { run, now } from "../db.js";
import { uid, jsonStr } from "../lib/util.js";

/**
 * محرك الأحداث — تسجيل مستقل: فشل تسجيل الحدث لا يفشل العملية الأصلية.
 * كل حدث: نوع + فاعل + كيان + تفاصيل JSON + IP/وقت.
 */
export function logEvent({
  type,
  actorType = "system",
  actorId = null,
  actorName = "النظام",
  entityType = null,
  entityId = null,
  entityLabel = null,
  details = {},
  ip = "",
}) {
  try {
    run(
      `INSERT INTO events (id,type,actor_type,actor_id,actor_name,entity_type,entity_id,entity_label,details,ip,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      uid("EV"),
      type,
      actorType,
      actorId,
      actorName,
      entityType,
      entityId,
      entityLabel,
      jsonStr(details),
      ip || "",
      now(),
    );
  } catch (e) {
    // استثناء صامت — لا يكسر العملية
    console.error("[events] فشل تسجيل حدث", e.message);
  }
}
