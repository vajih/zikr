/** Zikr Circle — Apps Script Web App Backend (MVP, cumulative progress) **/

// ======= META =======
const APP_VERSION = "v0.5-cumulative";

// ======= CONFIG / SHEETS =======
const SHEET_NAMES = {
  users: "users",
  relationships: "relationships",
  circles: "circles",
  memberships: "memberships",
  sessions: "sessions",
  counts: "counts",
  reflections: "reflections",
  invites: "invites",
};

// (kept for reference; ContentService doesn't use custom CORS headers)
const ALLOWED_ORIGINS = [
  "http://localhost:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:5501",
  "https://vajih.github.io",
];

// ======= HELPERS =======
function _sheet(name) {
  return SpreadsheetApp.getActive().getSheetByName(name);
}
function _headers(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}
function _rows(sh) {
  const n = Math.max(sh.getLastRow() - 1, 0);
  return n ? sh.getRange(2, 1, n, sh.getLastColumn()).getValues() : [];
}
function _toObjects(sh) {
  const h = _headers(sh);
  return _rows(sh).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
function _uuid() {
  return Utilities.getUuid();
}
function _now() {
  return new Date().toISOString();
}
function _json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ======= AUTH (MVP: token stored on users sheet) =======
function getUserByToken(token) {
  if (!token) return null;
  const sh = _sheet(SHEET_NAMES.users);
  const h = _headers(sh);
  const tcol = h.indexOf("token") + 1;
  if (tcol < 1) return null;
  const n = Math.max(sh.getLastRow() - 1, 0);
  if (!n) return null;

  const vals = sh.getRange(2, tcol, n, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (vals[i][0] === token) {
      const row = sh.getRange(i + 2, 1, 1, h.length).getValues()[0];
      return Object.fromEntries(h.map((k, j) => [k, row[j]]));
    }
  }
  return null;
}

// ======= HTTP HANDLERS =======
function doGet(e) {
  try {
    const action = (
      (e && e.parameter && e.parameter.action) ||
      "status"
    ).toLowerCase();

    if (action === "status") {
      return _json({
        ok: true,
        ts: _now(),
        app: "zikr-circle",
        version: APP_VERSION,
      });
    }

    if (action === "me") {
      const me = getUserByToken(e.parameter.token);
      return _json({ ok: !!me, user: me });
    }

    // Enriched circles list with cumulative + last-session progress
    if (action === "list_circles") {
      const me = getUserByToken(e.parameter.token);
      if (!me) return _json({ ok: false, error: "auth" });

      const circles = _toObjects(_sheet(SHEET_NAMES.circles));
      const memberships = _toObjects(_sheet(SHEET_NAMES.memberships)).filter(
        (m) => m.user_email === me.email
      );
      const myIds = new Set(memberships.map((m) => m.circle_id));
      const mine = circles.filter((c) => myIds.has(c.id));

      const sessions = _toObjects(_sheet(SHEET_NAMES.sessions));

      const enriched = mine.map((c) => {
        const csessions = sessions.filter((s) => s.circle_id === c.id);

        // ----- LAST SESSION (most recent by start_at) -----
        const sorted = csessions
          .slice()
          .sort(
            (a, b) => new Date(b.start_at || 0) - new Date(a.start_at || 0)
          );
        const last = sorted[0] || null;
        const lastTarget = Number(
          (last && last.target_count) || c.target_count || 0
        );
        const lastCompleted = Number((last && last.completed_count) || 0);
        const lastPct =
          lastTarget > 0
            ? Math.min(100, Math.round((lastCompleted * 100) / lastTarget))
            : 0;
        const lastStatus = last ? String(last.status || "").toLowerCase() : "";

        // ----- CUMULATIVE (all sessions) -----
        const totalCompleted = csessions.reduce(
          (sum, s) => sum + (Number(s.completed_count) || 0),
          0
        );
        const totalTarget = Number(c.target_count) || 0;
        const totalPct =
          totalTarget > 0
            ? Math.min(100, Math.round((totalCompleted * 100) / totalTarget))
            : 0;

        return Object.assign({}, c, {
          // last session fields (back-compat)
          session_id: last ? last.id : "",
          session_status: lastStatus,
          current_target: lastTarget,
          completed_count: lastCompleted,
          progress_pct: lastPct,

          // cumulative fields (new)
          total_completed: totalCompleted,
          total_target: totalTarget,
          total_pct: totalPct,
        });
      });

      return _json({ ok: true, circles: enriched });
    }

    if (action === "get_session") {
      const me = getUserByToken(e.parameter.token);
      if (!me) return _json({ ok: false, error: "auth" });
      const sid = e.parameter.session_id;
      const sessions = _toObjects(_sheet(SHEET_NAMES.sessions));
      const s = sessions.find((x) => x.id === sid);
      if (!s) return _json({ ok: false, error: "not_found" });
      const circle = _toObjects(_sheet(SHEET_NAMES.circles)).find(
        (c) => c.id === s.circle_id
      );
      return _json({ ok: true, session: s, circle });
    }

    // Minimal info about an invite token (for preview)
    if (action === "get_invite") {
      const token = e.parameter.invite_token;
      const invSh = _sheet(SHEET_NAMES.invites);
      const inv = _rows(invSh).find((r) => r[4] === token); // token col index 5 (0-based 4)
      if (!inv) return _json({ ok: false, error: "invalid_token" });
      const circle_id = inv[1];
      const circle = _toObjects(_sheet(SHEET_NAMES.circles)).find(
        (c) => c.id === circle_id
      );
      return _json({
        ok: true,
        circle: circle ? { id: circle.id, name: circle.name } : null,
      });
    }

    return _json({ ok: false, error: "unknown_get" });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body =
      e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = (body.action || "").toLowerCase();

    // --- signup (idempotent by email) ---
    if (action === "signup") {
      let { email, name, locale, timezone } = body;
      email = String(email || "")
        .trim()
        .toLowerCase();
      if (!email) return _json({ ok: false, error: "invalid_email" });

      const sh = _sheet(SHEET_NAMES.users);
      const h = _headers(sh);
      const emailCol = h.indexOf("email") + 1;
      const nameCol = h.indexOf("name") + 1;
      const tokenCol = h.indexOf("token") + 1;
      const lastLoginCol = h.indexOf("last_login_at") + 1;

      const n = Math.max(sh.getLastRow() - 1, 0);
      let rowIndex = -1,
        existing = null;

      if (n > 0 && emailCol > 0) {
        const values = sh.getRange(2, emailCol, n, 1).getValues();
        for (let i = 0; i < values.length; i++) {
          if (String(values[i][0]).toLowerCase() === email) {
            rowIndex = i + 2;
            break;
          }
        }
        if (rowIndex > 0) {
          const row = sh.getRange(rowIndex, 1, 1, h.length).getValues()[0];
          existing = Object.fromEntries(h.map((k, j) => [k, row[j]]));
        }
      }

      if (existing) {
        if (lastLoginCol > 0)
          sh.getRange(rowIndex, lastLoginCol).setValue(_now());
        if (name && !existing.name && nameCol > 0)
          sh.getRange(rowIndex, nameCol).setValue(name);
        return _json({
          ok: true,
          existed: true,
          token: existing.token,
          user: { email: existing.email, name: existing.name || name || "" },
        });
      }

      const token = _uuid();
      sh.appendRow([
        _uuid(),
        email,
        name || "",
        locale || "en",
        timezone || "America/Chicago",
        _now(),
        _now(),
        token,
      ]);
      return _json({ ok: true, existed: false, token });
    }

    // --- create_circle ---
    if (action === "create_circle") {
      const me = getUserByToken(body.token);
      if (!me) return _json({ ok: false, error: "auth" });

      const {
        name,
        recitation_text,
        target_count,
        start_at,
        end_at,
        privacy,
        adab_notes,
      } = body;
      const sh = _sheet(SHEET_NAMES.circles);
      const id = _uuid();
      sh.appendRow([
        id,
        me.email,
        name,
        recitation_text,
        Number(target_count) || 0,
        start_at || "",
        end_at || "",
        privacy || "private",
        adab_notes || "",
        _now(),
      ]);

      const m = _sheet(SHEET_NAMES.memberships);
      m.appendRow([_uuid(), id, me.email, "host", "active", _now()]);

      return _json({ ok: true, circle_id: id });
    }

    // --- start_session (closes older open sessions for this user+circle) ---
    if (action === "start_session") {
      const me = getUserByToken(body.token);
      if (!me) return _json({ ok: false, error: "auth" });

      const { circle_id, target_count } = body;

      // Close older open sessions for same circle & user
      const sessSh = _sheet(SHEET_NAMES.sessions);
      const sessRows = _rows(sessSh);
      for (let i = 0; i < sessRows.length; i++) {
        const r = sessRows[i];
        if (
          r[1] === circle_id &&
          r[2] === me.email &&
          String(r[7] || "").toLowerCase() === "open"
        ) {
          const rowIndex = i + 2;
          sessSh.getRange(rowIndex, 5).setValue(_now()); // end_at
          sessSh.getRange(rowIndex, 8).setValue("closed"); // status
        }
      }

      const s = _sheet(SHEET_NAMES.sessions);
      const sid = _uuid();
      s.appendRow([
        sid,
        circle_id,
        me.email,
        _now(),
        "",
        Number(target_count) || 0,
        0,
        "open",
      ]);
      return _json({ ok: true, session_id: sid });
    }

    // --- increment (auto-completes when reaching target) ---
    if (action === "increment") {
      const me = getUserByToken(body.token);
      if (!me) return _json({ ok: false, error: "auth" });

      const { session_id, delta } = body;
      const sessSh = _sheet(SHEET_NAMES.sessions);
      const rows = _rows(sessSh);

      let idx = -1,
        current = 0,
        target = 0,
        status = "open";
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === session_id) {
          idx = i + 2;
          target = Number(rows[i][5]) || 0; // target_count
          current = Number(rows[i][6]) || 0; // completed_count
          status = String(rows[i][7] || "open"); // status
          break;
        }
      }
      if (idx < 0) return _json({ ok: false, error: "session_not_found" });
      if (status !== "open")
        return _json({ ok: false, error: "session_closed" });

      const add = Number(delta) || 1;
      const newVal = current + add;
      sessSh.getRange(idx, 7).setValue(newVal); // completed_count
      _sheet(SHEET_NAMES.counts).appendRow([
        _uuid(),
        session_id,
        me.email,
        add,
        _now(),
      ]);

      let goal_reached = false;
      if (newVal >= target && target > 0) {
        sessSh.getRange(idx, 5).setValue(_now()); // end_at
        sessSh.getRange(idx, 8).setValue("completed"); // status
        goal_reached = true;
      }
      return _json({ ok: true, completed_count: newVal, goal_reached });
    }

    // --- close_session ---
    if (action === "close_session") {
      const me = getUserByToken(body.token);
      if (!me) return _json({ ok: false, error: "auth" });

      const { session_id } = body;
      const sh = _sheet(SHEET_NAMES.sessions);
      const rows = _rows(sh);
      let idx = -1;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === session_id) {
          idx = i + 2;
          break;
        }
      }
      if (idx < 0) return _json({ ok: false, error: "session_not_found" });

      sh.getRange(idx, 5).setValue(_now()); // end_at
      sh.getRange(idx, 8).setValue("closed"); // status
      return _json({ ok: true });
    }

    // --- reflect ---
    if (action === "reflect") {
      const me = getUserByToken(body.token);
      if (!me) return _json({ ok: false, error: "auth" });

      const { session_id, text, visibility } = body;
      _sheet(SHEET_NAMES.reflections).appendRow([
        _uuid(),
        session_id,
        me.email,
        text || "",
        visibility || "circle",
        _now(),
      ]);
      return _json({ ok: true });
    }

    // --- create_invite ---
    if (action === "create_invite") {
      const me = getUserByToken(body.token);
      if (!me) return _json({ ok: false, error: "auth" });

      const { circle_id, invitee_email } = body;
      const invSh = _sheet(SHEET_NAMES.invites);
      const invite_token = _uuid();
      invSh.appendRow([
        _uuid(),
        circle_id,
        me.email,
        invitee_email || "",
        invite_token,
        "sent",
        _now(),
      ]);
      return _json({ ok: true, invite_token });
    }

    // --- accept_invite (idempotent) ---
    if (action === "accept_invite") {
      const me = getUserByToken(body.token);
      if (!me) return _json({ ok: false, error: "auth" });

      const { invite_token } = body;
      const invSh = _sheet(SHEET_NAMES.invites);
      const invRows = _rows(invSh);

      let idx = -1,
        circle_id = null,
        inviter_email = null,
        status = null,
        invitee_email = "";
      for (let i = 0; i < invRows.length; i++) {
        if (invRows[i][4] === invite_token) {
          // token col (5th)
          idx = i + 2;
          circle_id = invRows[i][1];
          inviter_email = invRows[i][2];
          invitee_email = invRows[i][3] || "";
          status = invRows[i][5] || "";
          break;
        }
      }
      if (idx < 0) return _json({ ok: false, error: "invalid_token" });

      // Mark accepted (idempotent)
      invSh.getRange(idx, 6).setValue("accepted");
      // Fill invitee_email if blank with the joiner
      if (!invitee_email) invSh.getRange(idx, 4).setValue(me.email);

      // Add membership if missing
      const memSh = _sheet(SHEET_NAMES.memberships);
      const memRows = _rows(memSh);
      const exists = memRows.some(
        (r) => r[1] === circle_id && r[2] === me.email
      );
      if (!exists) {
        memSh.appendRow([
          _uuid(),
          circle_id,
          me.email,
          "member",
          "active",
          _now(),
        ]);
      }

      // Relationships (both directions) if not present
      const relSh = _sheet(SHEET_NAMES.relationships);
      const relRows = _rows(relSh);
      const hasAB = relRows.some(
        (r) => r[1] === inviter_email && r[2] === me.email
      );
      const hasBA = relRows.some(
        (r) => r[1] === me.email && r[2] === inviter_email
      );
      if (inviter_email) {
        if (!hasAB) relSh.appendRow([_uuid(), inviter_email, me.email, _now()]);
        if (!hasBA) relSh.appendRow([_uuid(), me.email, inviter_email, _now()]);
      }

      return _json({ ok: true, circle_id });
    }

    return _json({ ok: false, error: "unknown_post" });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}
