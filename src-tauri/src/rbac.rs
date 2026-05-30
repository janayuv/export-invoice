use crate::db::state::{AuthSession, SessionIdentity};

/// Requires an active session with admin role.
pub fn require_admin_session(session: &AuthSession) -> Result<SessionIdentity, String> {
    let sess = session.get()?;
    if sess.role != "admin" {
        return Err("ERR_PERMISSION: requires admin role".into());
    }
    Ok(sess)
}
