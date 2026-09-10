import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate } from "../../lib/api.jsx";
import { Spinner, Stat, Badge, Empty } from "../../components/ui.jsx";
import { PageHead } from "../../components/shell.jsx";
import { REQUEST_STATUSES, TICKET_STATUSES } from "../../lib/api.jsx";
import { showError, confirmDialog, promptDialog } from "../../lib/dialogs.jsx";

export function Dashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api("/api/admin/stats").then(setD).catch((e) => showError(e.message)); }, []);
  if (!d) return <Spinner />;
  const s = d.stats;
  return (
    <>
      <PageHead title="نظرة عامة" sub="ملخص فوري لكل ما يحتاج انتباهك" />
      <div className="grid cols3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <Stat icon="🏷️" label="العروض" value={s.offers} />
        <Stat icon="📋" label="إجمالي الطلبات" value={s.requests} />
        <Stat icon="🆕" label="طلبات جديدة" value={s.newRequests} />
        <Stat icon="✅" label="مكتملة المعلومات" value={s.infoComplete} />
        <Stat icon="👥" label="العملاء" value={s.clients} />
        <Stat icon="🎧" label="تذاكر مفتوحة" value={s.ticketsOpen} />
      </div>

      <div className="grid cols2 mt2">
        <div className="card pad0">
          <div className="card-head"><h3>طلبات تحتاج متابعة</h3><Link className="btn ghost sm" to="/admin/requests?needs=1">الكل ←</Link></div>
          {d.needsActionRequests?.length ? d.needsActionRequests.map((r) => (
            <Link key={r.id} to={`/admin/requests/${r.id}`} className="list-row">
              <div>
                <div className="t">{r.offer_title}</div>
                <div className="s">{r.user_name} · {fmtDate(r.created_at)}</div>
              </div>
              <Badge map={REQUEST_STATUSES} value={r.status} />
            </Link>
          )) : <Empty icon="🎉" title="لا طلبات معلقة" />}
        </div>
        <div className="card pad0">
          <div className="card-head"><h3>تذاكر بانتظار ردك</h3><Link className="btn ghost sm" to="/admin/tickets?needs=1">الكل ←</Link></div>
          {d.needsReplyTickets?.length ? d.needsReplyTickets.map((t) => (
            <Link key={t.id} to={`/admin/tickets/${t.id}`} className="list-row">
              <div>
                <div className="t">{t.subject}</div>
                <div className="s">{t.user_name} · {fmtDate(t.updated_at)}</div>
              </div>
              <Badge map={TICKET_STATUSES} value={t.status} />
            </Link>
          )) : <Empty icon="🎉" title="لا تذاكر معلقة" />}
        </div>
      </div>

      <div className="card pad0 mt2">
        <div className="card-head"><h3>آخر الأحداث</h3><Link className="btn ghost sm" to="/admin/events">السجل الكامل ←</Link></div>
        {d.recentEvents?.length ? (
          <div>
            {d.recentEvents.map((e) => (
              <div key={e.id} className="list-row">
                <div>
                  <span className="chip mono">{e.type}</span>
                  <b>{e.actor_name}</b>
                  {e.entity_label && <span className="muted small"> — {e.entity_label}</span>}
                </div>
                <span className="small muted">{fmtDate(e.created_at)}</span>
              </div>
            ))}
          </div>
        ) : <Empty icon="🕵️" title="لا أحداث بعد" />}
      </div>
    </>
  );
}
