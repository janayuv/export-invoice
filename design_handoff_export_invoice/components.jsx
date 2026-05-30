// components.jsx — Base UI, Mock Data, Sidebar, Layout
const { useState, useEffect, useRef, createContext, useContext } = React;

const NavCtx = createContext({ route: 'dashboard', onNavigate: () => {}, params: {} });
const useNav = () => useContext(NavCtx);

// ── Helpers ─────────────────────────────────────────────────────────────
function cls(...args) { return args.filter(Boolean).join(' '); }
function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = (iso || '').split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}
function fmtAmt(n, dec = 2) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n || 0);
}
function amountInWords(amount, currency) {
  const units = { USD: ['US DOLLAR', 'CENTS'], EUR: ['EURO', 'CENTS'], GBP: ['POUND STERLING', 'PENCE'], AED: ['UAE DIRHAM', 'FILS'], INR: ['INDIAN RUPEE', 'PAISE'] };
  const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  function tw(n) {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 ? ' ' + tw(n % 100) : '');
    if (n < 100000) return tw(Math.floor(n / 1000)) + ' THOUSAND' + (n % 1000 ? ' ' + tw(n % 1000) : '');
    return tw(Math.floor(n / 100000)) + ' LAKH' + (n % 100000 ? ' ' + tw(n % 100000) : '');
  }
  const major = Math.floor(amount), minor = Math.round((amount - major) * 100);
  const [maj, min] = units[currency] || ['UNIT', 'CENTS'];
  return (tw(major) || 'ZERO') + ' ' + maj + (minor > 0 ? ' AND ' + tw(minor) + ' ' + min : '') + ' ONLY';
}

// ── Mock Data ────────────────────────────────────────────────────────────
const COMPANY = {
  name: 'INZI CONTROLS INDIA PVT. LTD.',
  address: 'No. 47/A, Industrial Area, Phase II,\nAmbattur, Chennai \u2013 600 058, Tamil Nadu, INDIA',
  gstin: '33AAACI1234K1ZB', pan: 'AAACI1234K', iec: '1234567890',
  bank_name: 'HDFC Bank Ltd.', bank_account: '50200012345678',
  ifsc: 'HDFC0001234', swift: 'HDFCINBBCHE', bank_ad_code: '0344205',
  lut_arn_no: 'AD330424031234JW', lut_arn_date: '2024-04-01',
  place: 'CHENNAI', signatory_name: 'AUTHORIZED SIGNATORY',
};

const INVOICES = [
  {
    id: 1, invoice_number: 'EXP/25/2025-26', invoice_date: '2026-03-15',
    transport_mode: 'BY SEA', buyer_order_no: 'CTRD-20260225-03',
    duty_drawback: 'ALL INDUSTRY RATE', hs_code: '84148090',
    other_references: 'Internal PO ref: PO/7/2025-26',
    consignee_name: 'CTR CO.,LTD.',
    consignee_address: '# 68-26 Daehapsaneopdanji-ro, Hap-ri,\nDaehap-myeon, Changnyeong-gun,\nGYEONGNAM, Korea. Zip Code: 50307',
    buyer_if_other: '', country_of_origin: 'INDIA', country_of_destination: 'SOUTH KOREA',
    pre_carriage_by: 'BY ROAD', place_of_receipt: 'CHENNAI',
    vessel: 'MSC ANNA / TESSA', port_of_loading: 'CHENNAI', port_of_discharge: 'BUSAN',
    final_destination: 'SOUTH KOREA', terms_of_payment: '90 DAYS FROM DATE OF INVOICE',
    incoterm: 'EXW', currency: 'USD', exchange_rate: 84.5,
    net_weight: '405.20 kgs', gross_weight: '420.0 kgs', notes: '',
    status: 'final', show_sa_number: true,
    items: [
      { sr_no: 1, sa_number: 'SA-001', part_number: 'ICK-FAN-A01', marks_nos: 'INZI/ICK/1', no_of_pkgs: '2', description: 'INDUSTRIAL FAN BLADE ASSEMBLY (3-BLADE, D=450MM)', quantity: 10, unit: 'NOS', unit_price: 12.50, total_amount: 125.00 },
      { sr_no: 2, sa_number: 'SA-001', part_number: 'ICK-MTR-A02', marks_nos: 'INZI/ICK/2', no_of_pkgs: '1', description: 'MOTOR ASSEMBLY 3.7KW, 1450RPM, IE2 CLASS', quantity: 5, unit: 'NOS', unit_price: 85.00, total_amount: 425.00 },
      { sr_no: 3, sa_number: 'SA-002', part_number: 'ICK-BRG-003', marks_nos: 'INZI/ICK/2', no_of_pkgs: '1', description: 'BEARING SET 6205-2RS, 25MM BORE (SAMPLE, NIL VALUE)', quantity: 2, unit: 'NOS', unit_price: 0.00, total_amount: 0.00 },
    ],
    packing_list: [
      { sr_no: 1, marks_nos: 'INZI/ICK/1', no_of_pkgs: '2', dimensions: '60\u00d740\u00d730', dimensions_unit: 'CM' },
      { sr_no: 2, marks_nos: 'INZI/ICK/2', no_of_pkgs: '1', dimensions: '45\u00d735\u00d725', dimensions_unit: 'CM' },
    ],
  },
  {
    id: 2, invoice_number: 'EXP/24/2025-26', invoice_date: '2026-03-01',
    transport_mode: 'BY AIR', buyer_order_no: 'CTRD-20260201-01',
    duty_drawback: 'ALL INDUSTRY RATE', hs_code: '90318090',
    other_references: 'Internal PO ref: PO/6/2025-26',
    consignee_name: 'TAEYANG INDUSTRIAL CO.',
    consignee_address: '15F Teheran-ro 152, Gangnam-gu, Seoul 06236, South Korea',
    buyer_if_other: '', country_of_origin: 'INDIA', country_of_destination: 'SOUTH KOREA',
    pre_carriage_by: 'BY ROAD', place_of_receipt: 'CHENNAI',
    vessel: '', port_of_loading: 'CHENNAI', port_of_discharge: 'INCHEON',
    final_destination: 'SOUTH KOREA', terms_of_payment: '60 DAYS FROM DATE OF INVOICE',
    incoterm: 'FOB', currency: 'USD', exchange_rate: 84.5,
    net_weight: '12.50 kgs', gross_weight: '14.0 kgs', notes: '',
    status: 'final', show_sa_number: false,
    items: [{ sr_no: 1, sa_number: '', part_number: 'ICK-SEN-001', marks_nos: 'INZI/TYG/1', no_of_pkgs: '1', description: 'PRESSURE SENSOR MODULE 0-10BAR, 4-20MA OUTPUT', quantity: 20, unit: 'NOS', unit_price: 45.00, total_amount: 900.00 }],
    packing_list: [{ sr_no: 1, marks_nos: 'INZI/TYG/1', no_of_pkgs: '1', dimensions: '30\u00d720\u00d715', dimensions_unit: 'CM' }],
  },
  {
    id: 3, invoice_number: 'EXP/23/2025-26', invoice_date: '2026-02-18',
    transport_mode: 'BY SEA', buyer_order_no: 'UAE-20260218-02',
    duty_drawback: 'ALL INDUSTRY RATE', hs_code: '84812090', other_references: '',
    consignee_name: 'AL FUTTAIM TRADING LLC',
    consignee_address: 'Festival City, Al Jadaf, P.O. Box 152, Dubai, UAE',
    buyer_if_other: '', country_of_origin: 'INDIA', country_of_destination: 'UAE',
    pre_carriage_by: 'BY ROAD', place_of_receipt: 'CHENNAI',
    vessel: '', port_of_loading: 'CHENNAI', port_of_discharge: 'JEBEL ALI',
    final_destination: 'UAE', terms_of_payment: '90 DAYS FROM DATE OF INVOICE',
    incoterm: 'EXW', currency: 'AED', exchange_rate: 23.0,
    net_weight: '', gross_weight: '', notes: '', status: 'draft', show_sa_number: true,
    items: [{ sr_no: 1, sa_number: 'SA-003', part_number: 'ICK-VLV-001', marks_nos: 'INZI/ALF/1', no_of_pkgs: '1', description: 'BUTTERFLY VALVE DN150 PN16 WITH ACTUATOR', quantity: 8, unit: 'NOS', unit_price: 125.00, total_amount: 1000.00 }],
    packing_list: [],
  },
  {
    id: 4, invoice_number: 'EXP/22/2025-26', invoice_date: '2026-02-10',
    transport_mode: 'BY SEA', buyer_order_no: 'CTRD-20260210-02',
    duty_drawback: 'ALL INDUSTRY RATE', hs_code: '84137090',
    other_references: 'Internal PO ref: PO/5/2025-26',
    consignee_name: 'CTR CO.,LTD.',
    consignee_address: '# 68-26 Daehapsaneopdanji-ro, Hap-ri, Korea. Zip Code: 50307',
    buyer_if_other: '', country_of_origin: 'INDIA', country_of_destination: 'SOUTH KOREA',
    pre_carriage_by: 'BY ROAD', place_of_receipt: 'CHENNAI',
    vessel: 'EVER GIVEN / FALCON', port_of_loading: 'CHENNAI', port_of_discharge: 'BUSAN',
    final_destination: 'SOUTH KOREA', terms_of_payment: '90 DAYS FROM DATE OF INVOICE',
    incoterm: 'EXW', currency: 'USD', exchange_rate: 84.5,
    net_weight: '820.0 kgs', gross_weight: '850.0 kgs', notes: '',
    status: 'final', show_sa_number: true,
    items: [{ sr_no: 1, sa_number: 'SA-004', part_number: 'ICK-PMP-A01', marks_nos: 'INZI/ICK/1', no_of_pkgs: '3', description: 'CENTRIFUGAL PUMP 5.5KW, 50MM BORE, SS316 IMPELLER', quantity: 3, unit: 'NOS', unit_price: 320.00, total_amount: 960.00 }],
    packing_list: [{ sr_no: 1, marks_nos: 'INZI/ICK/1', no_of_pkgs: '3', dimensions: '80\u00d760\u00d750', dimensions_unit: 'CM' }],
  },
  {
    id: 5, invoice_number: 'EXP/21/2025-26', invoice_date: '2026-01-28',
    transport_mode: 'BY COURIER', buyer_order_no: 'EU-20260128-01',
    duty_drawback: '', hs_code: '84819090', other_references: '',
    consignee_name: 'SCHAEFER GMBH',
    consignee_address: 'Scheffelstrasse 31, 20357 Hamburg, Germany',
    buyer_if_other: '', country_of_origin: 'INDIA', country_of_destination: 'GERMANY',
    pre_carriage_by: '', place_of_receipt: 'CHENNAI',
    vessel: '', port_of_loading: 'CHENNAI', port_of_discharge: 'FRANKFURT',
    final_destination: 'GERMANY', terms_of_payment: '30 DAYS FROM DATE OF INVOICE',
    incoterm: 'DDP', currency: 'EUR', exchange_rate: 92.0,
    net_weight: '', gross_weight: '', notes: '', status: 'draft', show_sa_number: false,
    items: [],
    packing_list: [],
  },
];

const POS = [
  { id: 7, po_number: 'PO/7/2025-26', customer_po_no: 'CTRD-20260225-03', po_date: '2026-02-25', customer_name: 'CTR CO.,LTD.', currency: 'USD', status: 'confirmed' },
  { id: 6, po_number: 'PO/6/2025-26', customer_po_no: 'CTRD-20260201-01', po_date: '2026-02-01', customer_name: 'TAEYANG INDUSTRIAL CO.', currency: 'USD', status: 'closed' },
  { id: 5, po_number: 'PO/5/2025-26', customer_po_no: 'UAE-20260218-02', po_date: '2026-01-20', customer_name: 'AL FUTTAIM TRADING LLC', currency: 'AED', status: 'draft' },
  { id: 4, po_number: 'PO/4/2025-26', customer_po_no: 'EU-20260128-01', po_date: '2026-01-10', customer_name: 'SCHAEFER GMBH', currency: 'EUR', status: 'confirmed' },
];

const CUSTOMERS = [
  { id: 1, name: 'CTR CO.,LTD.', country: 'South Korea', currency: 'USD', port_of_discharge: 'BUSAN', invoices: 3 },
  { id: 2, name: 'TAEYANG INDUSTRIAL CO.', country: 'South Korea', currency: 'USD', port_of_discharge: 'INCHEON', invoices: 1 },
  { id: 3, name: 'AL FUTTAIM TRADING LLC', country: 'UAE', currency: 'AED', port_of_discharge: 'JEBEL ALI', invoices: 1 },
  { id: 4, name: 'SCHAEFER GMBH', country: 'Germany', currency: 'EUR', port_of_discharge: 'HAMBURG', invoices: 1 },
];

const USERS = [
  { id: 1, name: 'Rajesh Kumar', role: 'admin' },
  { id: 2, name: 'Priya Nair', role: 'operator' },
  { id: 3, name: 'Viewer User', role: 'viewer' },
];

// ── Icons (Font Awesome 6 Solid via CDN) ────────────────────────────────
const IMAP = {
  dashboard: 'gauge', invoices: 'file-invoice', create: 'circle-plus',
  pos: 'cart-shopping', entries: 'clipboard-list', reports: 'chart-bar',
  settings: 'gear', users: 'users', customers: 'building',
  logout: 'right-from-bracket', chevronRight: 'chevron-right',
  chevronLeft: 'chevron-left', chevronDown: 'chevron-down',
  search: 'magnifying-glass', back: 'arrow-left', edit: 'pen-to-square',
  check: 'circle-check', trash: 'trash-can', pdf: 'file-pdf',
  excel: 'file-excel', save: 'floppy-disk', close: 'xmark',
  plus: 'plus', minus: 'minus', ship: 'ship', weight: 'weight-hanging',
  userCheck: 'user-check', filePlus: 'file-circle-plus',
  boxes: 'boxes-stacking', box: 'box-open', sun: 'sun', moon: 'moon',
  collapse: 'angles-left', expand: 'angles-right', globe: 'globe',
  scale: 'scale-balanced', anchor: 'anchor', copy: 'copy', eye: 'eye',
  refresh: 'rotate', download: 'download', lock: 'lock', calendar: 'calendar',
  building: 'building', info: 'circle-info', warning: 'triangle-exclamation',
};
function Icon({ id, sz = 13 }) {
  const n = IMAP[id] || id;
  return React.createElement('i', { className: `fas fa-${n} fa-fw`, style: { fontSize: sz }, 'aria-hidden': 'true' });
}

// ── Button ────────────────────────────────────────────────────────────────
function Btn({ children, v = 'default', sz = 'sm', onClick, disabled, className, type = 'button', title }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={cls('btn', `btn-${v}`, `btn-${sz}`, className)}>
      {children}
    </button>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────
const BADGE_MAP = { final: 'primary', draft: 'warning', confirmed: 'success', closed: 'neutral', admin: 'amber', operator: 'blue', viewer: 'neutral' };
function Badge({ children, status, v }) {
  const variant = v || BADGE_MAP[status] || BADGE_MAP[(children || '').toLowerCase()] || 'neutral';
  return <span className={cls('badge', `badge-${variant}`)}>{children}</span>;
}

// ── Input ─────────────────────────────────────────────────────────────────
function Inp({ value, onChange, placeholder, readOnly, type = 'text', className, style }) {
  return (
    <input className={cls('inp', className)} type={type} value={value ?? ''}
      readOnly={readOnly} onChange={onChange} placeholder={placeholder} style={style} />
  );
}

// ── Textarea ──────────────────────────────────────────────────────────────
function UiText({ value, onChange, placeholder, rows = 3, className }) {
  return (
    <textarea className={cls('inp', className)} value={value ?? ''} onChange={onChange}
      placeholder={placeholder} rows={rows} style={{ resize: 'vertical' }} />
  );
}

// ── Select ─────────────────────────────────────────────────────────────────
function UiSel({ value, onChange, options, className, style }) {
  return (
    <div className="sel-wrap" style={style}>
      <select className={cls('inp', 'sel', className)} value={value}
        onChange={e => onChange(e.target.value)}>
        {(options || []).map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
      <i className="fas fa-chevron-down sel-arrow" />
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────
function UiCard({ children, className, style }) {
  return <div className={cls('card', className)} style={style}>{children}</div>;
}

// ── Field ─────────────────────────────────────────────────────────────────
function Field({ label, children, error }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

// ── StatCard ────────────────────────────────────────────────────────────────
const STAT_COLORS = {
  primary: ['var(--primary-dim)', 'var(--primary)'],
  success: ['var(--success-dim)', 'var(--success)'],
  warning: ['var(--warning-dim)', 'var(--warning)'],
  neutral: ['var(--bg-hover)', 'var(--text-2)'],
};
function StatCard({ title, value, icon, color = 'neutral', sub, onClick }) {
  const [bg, fg] = STAT_COLORS[color] || STAT_COLORS.neutral;
  return (
    <div className="card stat-card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <span className="stat-label">{title}</span>
          {icon && <div style={{ width: 28, height: 28, borderRadius: 6, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon id={icon} sz={12} /></div>}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: fg, lineHeight: 1, letterSpacing: '-0.5px' }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── PageHeader ───────────────────────────────────────────────────────────
function PageHeader({ title, sub, back, backRoute, actions }) {
  const { onNavigate } = useNav();
  return (
    <div className="page-hdr">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {back && <Btn v="ghost" sz="icon" onClick={() => onNavigate(backRoute || 'invoices')} title="Back"><Icon id="back" /></Btn>}
        <div>
          <h1 className="page-title">{title}</h1>
          {sub && <p className="page-sub">{sub}</p>}
        </div>
      </div>
      {actions && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────
function EmptyState({ icon = 'invoices', title, sub, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '52px 24px', color: 'var(--text-3)' }}>
      <Icon id={icon} sz={34} />
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginTop: 4 }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>{sub}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

// ── Nav sections ─────────────────────────────────────────────────────────
const NAV_SECTIONS = [
  { label: 'Overview', items: [{ route: 'dashboard', label: 'Dashboard', icon: 'dashboard' }] },
  { label: 'Export Documents', items: [
    { route: 'invoices', label: 'Invoices', icon: 'invoices' },
    { route: 'invoices.new', label: 'Create Invoice', icon: 'create', noViewer: true },
    { route: 'entries', label: 'Entries', icon: 'entries' },
    { route: 'customers', label: 'Customers', icon: 'customers', noViewer: true },
  ]},
  { label: 'Procurement', items: [{ route: 'pos', label: 'Purchase Orders', icon: 'pos' }] },
  { label: 'Reports', items: [{ route: 'reports', label: 'Entry Report', icon: 'reports' }] },
  { label: 'Administration', items: [
    { route: 'settings', label: 'Settings', icon: 'settings', adminOnly: true },
    { route: 'users', label: 'User Management', icon: 'users', adminOnly: true },
  ]},
];

// ── Sidebar ──────────────────────────────────────────────────────────────
function Sidebar({ collapsed, route, onNavigate, user, onLogout, isDark, onToggleTheme }) {
  const ROLE_V = { admin: 'amber', operator: 'blue', viewer: 'neutral' };
  const isActive = (item) => route === item.route
    || (item.route === 'invoices' && ['invoices.detail', 'invoices.new'].includes(route))
    || (item.route === 'pos' && route === 'pos.detail');

  return (
    <aside className={cls('sidebar', collapsed ? 'sidebar-closed' : 'sidebar-open')}>
      <div className="sb-logo">
        <div className="sb-logo-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
        </div>
        {!collapsed && <div><div className="sb-app-name">Export Invoice</div><div className="sb-version">v0.4.0</div></div>}
      </div>

      <nav className="sb-nav">
        {NAV_SECTIONS.map(sec => {
          const visible = sec.items.filter(item => {
            if (item.adminOnly && user?.role !== 'admin') return false;
            if (item.noViewer && user?.role === 'viewer') return false;
            return true;
          });
          if (!visible.length) return null;
          return (
            <div key={sec.label} className="sb-section">
              {!collapsed && <div className="sb-section-label">{sec.label}</div>}
              {visible.map(item => (
                <div key={item.route} className={cls('nav-item', isActive(item) && 'active')}
                  onClick={() => onNavigate(item.route)} title={collapsed ? item.label : undefined}>
                  <span className="nav-icon"><Icon id={item.icon} sz={13} /></span>
                  {!collapsed && <span className="nav-label">{item.label}</span>}
                  {!collapsed && isActive(item) && <span className="nav-active-dot" />}
                </div>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="sb-bottom">
        <div className="nav-item" onClick={onToggleTheme} title={collapsed ? 'Toggle theme' : undefined}>
          <span className="nav-icon"><Icon id={isDark ? 'sun' : 'moon'} sz={13} /></span>
          {!collapsed && <span className="nav-label">{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
        </div>
      </div>

      {user && (
        <div className="sb-user">
          <div className="sb-user-inner">
            <div className="sb-avatar">{user.name.charAt(0).toUpperCase()}</div>
            {!collapsed && <>
              <div className="sb-user-info">
                <div className="sb-user-name">{user.name}</div>
                <Badge v={ROLE_V[user.role]}>{user.role}</Badge>
              </div>
              <Btn v="ghost" sz="icon" onClick={onLogout} title="Sign out"><Icon id="logout" sz={12} /></Btn>
            </>}
          </div>
        </div>
      )}
    </aside>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────
function Layout({ children, route, onNavigate, user, onLogout, collapsed, isDark, onToggleTheme }) {
  return (
    <NavCtx.Provider value={{ route, onNavigate }}>
      <div className="app-shell">
        <Sidebar collapsed={collapsed} route={route} onNavigate={onNavigate}
          user={user} onLogout={onLogout} isDark={isDark} onToggleTheme={onToggleTheme} />
        <main className="main-area">{children}</main>
      </div>
    </NavCtx.Provider>
  );
}

Object.assign(window, {
  NavCtx, useNav, cls, Icon, Btn, Badge, Inp, UiText, UiSel,
  UiCard, Field, StatCard, PageHeader, EmptyState, Sidebar, Layout,
  COMPANY, INVOICES, POS, CUSTOMERS, USERS, NAV_SECTIONS,
  formatDate, fmtAmt, amountInWords,
});
