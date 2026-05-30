// app-screens.jsx — LoginScreen, Dashboard, POList, SettingsPage
const { useState } = React;
const { useNav, cls, Icon, Btn, Badge, Inp, UiText, UiCard, UiSel, Field, StatCard, PageHeader, EmptyState,
  COMPANY, INVOICES, POS, CUSTOMERS, USERS, formatDate, fmtAmt } = window;

// ── Login Screen ──────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [err, setErr] = useState('');

  const handleDigit = d => {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setErr('');
    if (next.length === 6 && sel) {
      setTimeout(() => {
        if (next.length === 6) {
          onLogin(sel);
        } else {
          setShake(true);
          setErr('Incorrect PIN. Try again.');
          setTimeout(() => { setShake(false); setPin(''); setErr(''); }, 600);
        }
      }, 80);
    }
  };

  const handleBksp = () => { setPin(p => p.slice(0, -1)); setErr(''); };

  const ROLE_V = { admin: 'amber', operator: 'blue', viewer: 'neutral' };

  return (
    <div className="login-bg">
      <div className={cls('login-card', shake && 'shake-anim')}>
        <div className="login-logo-wrap">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
        </div>
        <h1 className="login-title">Export Invoice</h1>
        <p className="login-sub">Select your profile and enter PIN to sign in</p>

        <div className="login-users">
          {USERS.map(u => (
            <div key={u.id} className={cls('login-user-card', sel?.id === u.id && 'active')}
              onClick={() => { setSel(u); setPin(''); setErr(''); }}>
              <div className="login-avatar">{u.name.charAt(0)}</div>
              <div className="login-user-name">{u.name.split(' ')[0]}</div>
              <Badge v={ROLE_V[u.role]}>{u.role}</Badge>
            </div>
          ))}
        </div>

        {sel && (
          <div className="pin-area">
            <div className="pin-dots">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={cls('pin-dot', i < pin.length && 'filled')} />
              ))}
            </div>

            {err && <p className="pin-error">{err}</p>}

            <div className="keypad">
              {[1,2,3,4,5,6,7,8,9,null,0,'⌫'].map((d, i) => (
                <div key={i} className={cls('keypad-key', d === null && 'empty')}
                  onClick={() => { if (d === '⌫') handleBksp(); else if (d !== null) handleDigit(String(d)); }}>
                  {d}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 10 }}>
              Type any 6 digits — this is a demo
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────
function Dashboard({ user }) {
  const { onNavigate } = useNav();
  const drafts = INVOICES.filter(i => i.status === 'draft').length;
  const finals = INVOICES.filter(i => i.status === 'final').length;
  const thisMonth = INVOICES.filter(i => (i.invoice_date || '').startsWith('2026-03')).length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const recent = INVOICES.slice(0, 5);
  const invAmt = inv => (inv.items || []).reduce((s, it) => s + it.total_amount, 0);

  const monthData = [42, 68, 35, 82, 58, 91, 74, 48, 100, 77, 62, 88];

  const destinations = [
    { country: 'South Korea', count: 3, pct: 60, color: 'var(--primary)' },
    { country: 'UAE', count: 1, pct: 20, color: 'var(--warning)' },
    { country: 'Germany', count: 1, pct: 20, color: 'var(--success)' },
  ];

  return (
    <div className="page-wrap">
      <div style={{ marginBottom: 4 }}>
        <h1 className="page-title">{greeting}, {user?.name?.split(' ')[0] || 'Admin'}</h1>
        <p className="page-sub">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          &nbsp;&mdash;&nbsp;Export Invoice Dashboard
        </p>
      </div>

      <div className="grid-4">
        <StatCard title="Total Invoices" value={INVOICES.length} icon="invoices" color="neutral" sub="All fiscal year" onClick={() => onNavigate('invoices')} />
        <StatCard title="This Month" value={thisMonth} icon="calendar" color="primary" sub="March 2026" onClick={() => onNavigate('invoices')} />
        <StatCard title="Draft" value={drafts} icon="edit" color="warning" sub="Pending finalization" onClick={() => onNavigate('invoices')} />
        <StatCard title="Finalized" value={finals} icon="check" color="success" sub="Completed" onClick={() => onNavigate('invoices')} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn v="default" sz="md" onClick={() => onNavigate('invoices.new')}><Icon id="plus" sz={13} /> New Invoice</Btn>
        <Btn v="outline" sz="md" onClick={() => onNavigate('invoices')}><Icon id="invoices" sz={13} /> View All Invoices</Btn>
        <Btn v="outline" sz="md" onClick={() => onNavigate('pos')}><Icon id="pos" sz={13} /> Purchase Orders</Btn>
      </div>

      <div className="grid-2">
        {/* Recent invoices */}
        <div className="card">
          <div className="card-hdr">
            <span className="card-title">Recent Invoices</span>
            <Btn v="ghost" sz="xs" onClick={() => onNavigate('invoices')}>View all <Icon id="chevronRight" sz={10} /></Btn>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Consignee</th>
                <th style={{ textAlign: 'right' }}>Amt</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(inv => (
                <tr key={inv.id} onClick={() => onNavigate('invoices.detail', { id: inv.id })}>
                  <td><span className="mono-cell primary-cell" style={{ fontSize: 11 }}>{inv.invoice_number}</span></td>
                  <td className="strong-cell" style={{ fontSize: 12, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.consignee_name}</td>
                  <td style={{ textAlign: 'right' }}>
                    {invAmt(inv) > 0 ? <span className="mono-cell" style={{ fontSize: 11 }}>{fmtAmt(invAmt(inv))}</span> : <span className="muted-cell">—</span>}
                  </td>
                  <td><Badge status={inv.status}>{inv.status === 'final' ? 'Final' : 'Draft'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Charts column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div className="card-hdr"><span className="card-title">Export Volume (12 months)</span></div>
            <div style={{ padding: '10px 14px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 72 }}>
                {monthData.map((h, i) => (
                  <div key={i} style={{ flex: 1, background: i === 11 ? 'var(--primary)' : 'var(--primary-dim)', borderRadius: '3px 3px 0 0', height: `${h}%`, transition: 'all 0.3s', cursor: 'default' }} title={`Month ${i + 1}`} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--text-3)' }}>
                <span>Jun '25</span><span>Dec '25</span><span>May '26</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-hdr"><span className="card-title">By Destination</span></div>
            <div style={{ padding: '10px 14px 14px' }}>
              {destinations.map(d => (
                <div key={d.country} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: 'var(--text-2)' }}>{d.country}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{d.count} invoice{d.count !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--bg-hover)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${d.pct}%`, background: d.color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PO List ──────────────────────────────────────────────────────────────
function POList() {
  const { onNavigate } = useNav();
  const [search, setSearch] = useState('');

  const filtered = POS.filter(po => {
    const q = search.toLowerCase();
    return !q || po.po_number.toLowerCase().includes(q) || po.customer_po_no.toLowerCase().includes(q) || po.customer_name.toLowerCase().includes(q);
  });

  return (
    <div className="page-wrap">
      <PageHeader
        title="Purchase Orders"
        sub={`${POS.length} orders total`}
        actions={<Btn v="default" sz="sm"><Icon id="plus" sz={11} /> New PO</Btn>}
      />

      <div className="filter-bar">
        <div className="search-wrap">
          <Icon id="search" sz={11} />
          <input className="inp search-inp" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search customer PO, internal ref, or customer…" />
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Customer PO No</th>
              <th>Internal Ref</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Currency</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 0 }}>
                <EmptyState icon="pos" title="No purchase orders found" sub={search ? 'Adjust your search' : 'Create your first purchase order'} />
              </td></tr>
            ) : filtered.map(po => (
              <tr key={po.id} onClick={() => {}}>
                <td><span className="mono-cell primary-cell">{po.customer_po_no || '—'}</span></td>
                <td className="muted-cell">{po.po_number}</td>
                <td className="muted-cell">{formatDate(po.po_date)}</td>
                <td className="strong-cell">{po.customer_name}</td>
                <td><span className="mono-cell" style={{ fontSize: 11 }}>{po.currency}</span></td>
                <td><Badge status={po.status}>{po.status.charAt(0).toUpperCase() + po.status.slice(1)}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────
function SettingsPage() {
  const [data, setData] = useState({ ...COMPANY });
  const [saved, setSaved] = useState(false);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  const F = ({ label, fk, ph, mono, type }) => (
    <Field label={label}>
      <Inp value={data[fk] || ''} onChange={e => set(fk, e.target.value)}
        placeholder={ph} type={type || 'text'}
        className={mono ? 'mono-inp' : ''} />
    </Field>
  );

  return (
    <div className="page-wrap">
      <PageHeader title="Settings" sub="Company information, banking details, and export configuration"
        actions={<>
          {saved && <span style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon id="check" sz={12} /> Saved successfully
          </span>}
          <Btn v="default" sz="sm" onClick={save}><Icon id="save" sz={11} /> Save Changes</Btn>
        </>}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Exporter Info */}
        <div className="card">
          <div className="card-hdr">
            <div className="sec-icon"><Icon id="building" sz={12} /></div>
            <div><div className="card-title">Exporter Information</div>
              <div className="card-desc">Company name and registration details</div></div>
          </div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="grid-2">
              <F label="Company Name *" fk="name" ph="INZI CONTROLS INDIA PVT. LTD." />
              <F label="GSTIN" fk="gstin" ph="33AAACI1234K1ZB" mono />
              <F label="PAN" fk="pan" ph="AAACI1234K" mono />
              <F label="IEC" fk="iec" ph="1234567890" mono />
            </div>
            <Field label="Address">
              <UiText value={data.address || ''} onChange={e => set('address', e.target.value)} rows={3} />
            </Field>
          </div>
        </div>

        {/* Banking */}
        <div className="card">
          <div className="card-hdr">
            <div className="sec-icon"><Icon id="scale" sz={12} /></div>
            <div><div className="card-title">Banking &amp; Export Details</div>
              <div className="card-desc">Bank account and LUT/ARN for zero-rated exports</div></div>
          </div>
          <div style={{ padding: 14 }}>
            <div className="grid-3">
              <F label="Bank Name" fk="bank_name" ph="HDFC Bank Ltd." />
              <F label="Account Number" fk="bank_account" ph="50200012345678" mono />
              <F label="IFSC Code" fk="ifsc" ph="HDFC0001234" mono />
              <F label="SWIFT Code" fk="swift" ph="HDFCINBBCHE" mono />
              <F label="AD Code" fk="bank_ad_code" ph="0344205" mono />
              <div />
              <F label="LUT ARN Number" fk="lut_arn_no" ph="AD330424031234JW" mono />
              <Field label="LUT ARN Date">
                <Inp type="date" value={data.lut_arn_date || ''} onChange={e => set('lut_arn_date', e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

        {/* Signatory */}
        <div className="card">
          <div className="card-hdr">
            <div className="sec-icon"><Icon id="userCheck" sz={12} /></div>
            <div><div className="card-title">Signatory Details</div>
              <div className="card-desc">Place of issue and authorized signatory name</div></div>
          </div>
          <div style={{ padding: 14 }}>
            <div className="grid-2">
              <F label="Place" fk="place" ph="CHENNAI" />
              <F label="Signatory Name" fk="signatory_name" ph="AUTHORIZED SIGNATORY" />
            </div>
          </div>
        </div>

        {/* Logo */}
        <div className="card">
          <div className="card-hdr">
            <div className="sec-icon"><Icon id="building" sz={12} /></div>
            <div><div className="card-title">Company Logo</div>
              <div className="card-desc">Appears in PDF invoice header (max 2 MB, stored as Base64)</div></div>
          </div>
          <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 80, height: 56, borderRadius: 6, border: '2px dashed var(--border-mid)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--text-3)' }}>
              <Icon id="building" sz={18} />
              <span style={{ fontSize: 10 }}>No logo</span>
            </div>
            <div>
              <Btn v="outline" sz="sm"><Icon id="download" sz={11} /> Upload Logo</Btn>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5, lineHeight: 1.5 }}>
                PNG or JPG, max 2 MB.<br />Displayed in PDF invoice header.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function PlaceholderScreen({ title, sub, icon }) {
  return (
    <div className="page-wrap">
      <PageHeader title={title} sub={sub} />
      <div className="card">
        <EmptyState icon={icon || 'invoices'} title={`${title} — coming soon`} sub="This section is under construction in this prototype." />
      </div>
    </div>
  );
}

Object.assign(window, { LoginScreen, Dashboard, POList, SettingsPage, PlaceholderScreen });
