// invoice-screens.jsx — InvoiceList, InvoiceNew, InvoiceDetail + PDF Preview
const { useState, useRef } = React;
const { useNav, cls, Icon, Btn, Badge, Inp, UiText, UiSel, UiCard, Field, PageHeader, EmptyState,
  COMPANY, INVOICES, POS, CUSTOMERS, formatDate, fmtAmt, amountInWords } = window;

const INCOTERMS = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'];
const CURRENCIES = ['USD','EUR','GBP','AED','INR'];
const TRANSPORT_MODES = ['BY SEA','BY AIR','BY ROAD','BY COURIER'];
const UNITS = ['MM','CM','INCH','M'];

// ── Invoice List ──────────────────────────────────────────────────────────
function InvoiceList() {
  const { onNavigate } = useNav();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const filtered = INVOICES.filter(inv => {
    const q = search.toLowerCase();
    const mQ = !q || inv.invoice_number.toLowerCase().includes(q)
      || inv.consignee_name.toLowerCase().includes(q)
      || (inv.buyer_order_no || '').toLowerCase().includes(q);
    const mS = status === 'all' || inv.status === status;
    return mQ && mS;
  });

  const invAmt = inv => (inv.items || []).reduce((s, it) => s + it.total_amount, 0);

  return (
    <div className="page-wrap">
      <PageHeader
        title="Invoices"
        sub={`${INVOICES.length} invoices total`}
        actions={<>
          <Btn v="outline" sz="sm"><Icon id="refresh" sz={11} /> Refresh</Btn>
          <Btn v="default" sz="sm" onClick={() => onNavigate('invoices.new')}><Icon id="plus" sz={11} /> New Invoice</Btn>
        </>}
      />

      <div className="filter-bar">
        <div className="search-wrap">
          <Icon id="search" sz={11} />
          <input className="inp search-inp" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search invoice #, consignee, buyer order…" />
        </div>
        <select className="inp" style={{ width: 140, fontSize: 12 }}
          value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="final">Final</option>
        </select>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Invoice No</th>
              <th>Date</th>
              <th>Mode</th>
              <th>Consignee</th>
              <th>Destination</th>
              <th>Cur</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 0 }}>
                <EmptyState icon="invoices" title="No invoices found"
                  sub={search ? 'Try adjusting your search filters' : 'Create your first export invoice to get started'}
                  action={<Btn v="default" sz="sm" onClick={() => onNavigate('invoices.new')}><Icon id="plus" sz={11} /> New Invoice</Btn>} />
              </td></tr>
            ) : filtered.map(inv => {
              const amt = invAmt(inv);
              return (
                <tr key={inv.id} onClick={() => onNavigate('invoices.detail', { id: inv.id })}>
                  <td><span className="mono-cell primary-cell">{inv.invoice_number}</span></td>
                  <td className="muted-cell">{formatDate(inv.invoice_date)}</td>
                  <td><span className="mode-tag">{inv.transport_mode.replace('BY ', '')}</span></td>
                  <td className="strong-cell">{inv.consignee_name}</td>
                  <td className="muted-cell">{inv.country_of_destination || '—'}</td>
                  <td><span className="mono-cell" style={{ fontSize: 11 }}>{inv.currency}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    {amt > 0 ? <span className="mono-cell">{fmtAmt(amt)}</span> : <span className="muted-cell">—</span>}
                  </td>
                  <td><Badge status={inv.status}>{inv.status === 'final' ? 'Final' : 'Draft'}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Invoice New ───────────────────────────────────────────────────────────
const FORM_SECS = [
  { id: 'customer', label: 'Customer & PO', icon: 'userCheck' },
  { id: 'details', label: 'Invoice Details', icon: 'invoices' },
  { id: 'consignee', label: 'Consignee', icon: 'users' },
  { id: 'shipping', label: 'Shipping', icon: 'ship' },
  { id: 'goods', label: 'Goods', icon: 'box' },
  { id: 'packing', label: 'Packing', icon: 'boxes' },
  { id: 'weights', label: 'Weight & Notes', icon: 'weight' },
];

function InvoiceNew({ params = {} }) {
  const { onNavigate } = useNav();
  const isEdit = Boolean(params.id);
  const src = isEdit ? (INVOICES.find(i => i.id === params.id) || INVOICES[0]) : null;

  const def = (k, fallback = '') => isEdit ? (src?.[k] ?? fallback) : fallback;

  const [form, setForm] = useState({
    invoice_number: def('invoice_number', 'EXP/26/2025-26'),
    invoice_date: def('invoice_date', '2026-05-27'),
    transport_mode: def('transport_mode', 'BY SEA'),
    buyer_order_no: def('buyer_order_no', ''),
    duty_drawback: def('duty_drawback', 'ALL INDUSTRY RATE'),
    hs_code: def('hs_code', ''),
    other_references: def('other_references', ''),
    consignee_name: def('consignee_name', ''),
    consignee_address: def('consignee_address', ''),
    buyer_if_other: def('buyer_if_other', ''),
    country_of_origin: def('country_of_origin', 'INDIA'),
    country_of_destination: def('country_of_destination', ''),
    pre_carriage_by: def('pre_carriage_by', 'BY ROAD'),
    place_of_receipt: def('place_of_receipt', 'CHENNAI'),
    pre_carrier: def('pre_carrier', ''),
    vessel: def('vessel', ''),
    port_of_loading: def('port_of_loading', 'CHENNAI'),
    port_of_discharge: def('port_of_discharge', ''),
    final_destination: def('final_destination', ''),
    terms_of_payment: def('terms_of_payment', ''),
    incoterm: def('incoterm', ''),
    currency: def('currency', 'USD'),
    exchange_rate: def('exchange_rate', 1),
    net_weight: def('net_weight', ''),
    gross_weight: def('gross_weight', ''),
    notes: def('notes', ''),
    show_sa_number: def('show_sa_number', true),
    selectedCustomer: def('consignee_name', ''),
    selectedPO: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [items, setItems] = useState(
    isEdit && src?.items?.length ? src.items.map(it => ({ ...it }))
    : [{ sr_no: 1, sa_number: '', part_number: '', marks_nos: '', no_of_pkgs: '', description: '', quantity: 1, unit: 'NOS', unit_price: 0, total_amount: 0 }]
  );

  const [packing, setPacking] = useState(
    isEdit && src?.packing_list?.length ? src.packing_list.map(p => ({ ...p }))
    : [{ sr_no: 1, marks_nos: 'INZI/ICK/1', no_of_pkgs: '1', dimensions: '', dimensions_unit: 'CM' }]
  );

  const [activeSection, setActiveSection] = useState('customer');
  const refs = useRef({});

  const totalAmt = items.reduce((s, it) => s + (it.total_amount || 0), 0);
  const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);

  const addItem = () => setItems(p => [...p, { sr_no: p.length + 1, sa_number: '', part_number: '', marks_nos: '', no_of_pkgs: '', description: '', quantity: 1, unit: 'NOS', unit_price: 0, total_amount: 0 }]);
  const removeItem = i => setItems(p => p.filter((_, idx) => idx !== i).map((it, idx) => ({ ...it, sr_no: idx + 1 })));
  const updItem = (i, k, v) => setItems(p => {
    const n = [...p]; n[i] = { ...n[i], [k]: v };
    if (k === 'quantity' || k === 'unit_price') n[i].total_amount = Number(((n[i].quantity || 0) * (n[i].unit_price || 0)).toFixed(2));
    return n;
  });
  const addPack = () => setPacking(p => [...p, { sr_no: p.length + 1, marks_nos: '', no_of_pkgs: '', dimensions: '', dimensions_unit: 'CM' }]);
  const remPack = i => setPacking(p => p.filter((_, idx) => idx !== i).map((pk, idx) => ({ ...pk, sr_no: idx + 1 })));
  const updPack = (i, k, v) => setPacking(p => { const n = [...p]; n[i] = { ...n[i], [k]: v }; return n; });

  const scrollTo = (id) => {
    setActiveSection(id);
    const el = refs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="form-shell">
      <div className="form-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn v="ghost" sz="icon" onClick={() => onNavigate('invoices')} title="Cancel"><Icon id="back" /></Btn>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{isEdit ? 'Edit Invoice' : 'New Invoice'}</span>
              <span className="inv-num-badge">{form.invoice_number}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Commercial export invoice &amp; packing list</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn v="ghost" sz="sm" onClick={() => onNavigate('invoices')}><Icon id="close" sz={11} /> Cancel</Btn>
          <Btn v="outline" sz="sm" onClick={() => onNavigate('invoices.detail', { id: 1 })}><Icon id="save" sz={11} /> Save Draft</Btn>
          <Btn v="default" sz="sm" onClick={() => onNavigate('invoices.detail', { id: 1 })}><Icon id="check" sz={11} /> Finalize</Btn>
        </div>
      </div>

      <div className="form-body-wrap">
        {/* TOC */}
        <div className="form-toc">
          {FORM_SECS.map(sec => (
            <div key={sec.id} className={cls('toc-item', activeSection === sec.id && 'active')}
              onClick={() => scrollTo(sec.id)}>
              <Icon id={sec.icon} sz={12} />
              <span>{sec.label}</span>
            </div>
          ))}
        </div>

        {/* Scrollable form */}
        <div className="form-content">

          {/* Customer & PO */}
          <div ref={el => refs.current['customer'] = el} className="form-sec">
            <div className="sec-hdr">
              <div className="sec-icon"><Icon id="userCheck" sz={12} /></div>
              <div><div className="sec-title">Customer &amp; Purchase Order</div>
                <div className="sec-desc">Select customer to prefill shipping details, then optionally link a PO.</div></div>
            </div>
            <div className="grid-2">
              <Field label="Customer">
                <UiSel value={form.selectedCustomer} onChange={v => {
                  set('selectedCustomer', v);
                  const c = CUSTOMERS.find(cu => cu.name === v);
                  if (c) { set('consignee_name', c.name); set('currency', c.currency); set('port_of_discharge', c.port_of_discharge); set('country_of_destination', c.country); }
                }} options={[{ value: '', label: 'Search and select customer…' }, ...CUSTOMERS.map(c => ({ value: c.name, label: `${c.name} · ${c.currency}` }))]} />
              </Field>
              <Field label="Purchase Order">
                <UiSel value={form.selectedPO} onChange={v => set('selectedPO', v)}
                  options={[{ value: '', label: 'None — enter manually' }, ...POS.filter(p => !form.selectedCustomer || p.customer_name === form.selectedCustomer).map(p => ({ value: p.id, label: `${p.customer_po_no} · ${p.po_date} · ${p.status}` }))]} />
              </Field>
            </div>
          </div>

          {/* Invoice Details */}
          <div ref={el => refs.current['details'] = el} className="form-sec">
            <div className="sec-hdr">
              <div className="sec-icon"><Icon id="invoices" sz={12} /></div>
              <div><div className="sec-title">Invoice Details</div>
                <div className="sec-desc">Reference details, currency, incoterm and commercial metadata.</div></div>
            </div>
            <div className="grid-3">
              <Field label="Invoice Number *"><Inp value={form.invoice_number} readOnly className="mono-inp" /></Field>
              <Field label="Invoice Date *"><Inp type="date" value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} /></Field>
              <Field label="Transport Mode">
                <UiSel value={form.transport_mode} onChange={v => set('transport_mode', v)} options={TRANSPORT_MODES.map(m => ({ value: m, label: m }))} />
              </Field>
              <Field label="Buyer's Order No"><Inp value={form.buyer_order_no} onChange={e => set('buyer_order_no', e.target.value)} placeholder="CTRD-20260225-03" /></Field>
              <Field label="Duty Drawback"><Inp value={form.duty_drawback} onChange={e => set('duty_drawback', e.target.value)} placeholder="ALL INDUSTRY RATE" /></Field>
              <Field label="HS Code"><Inp value={form.hs_code} onChange={e => set('hs_code', e.target.value)} placeholder="84148090" className="mono-inp" /></Field>
              <Field label="LUT ARN No"><Inp value={COMPANY.lut_arn_no} readOnly className="mono-inp" /></Field>
              <Field label="Other References"><Inp value={form.other_references} onChange={e => set('other_references', e.target.value)} placeholder="Internal PO ref: …" /></Field>
              <Field label="Currency">
                <UiSel value={form.currency} onChange={v => set('currency', v)} options={CURRENCIES.map(c => ({ value: c, label: c }))} />
              </Field>
              {form.currency !== 'INR' && (
                <Field label="Exchange Rate (INR/unit)">
                  <Inp type="number" value={form.exchange_rate} onChange={e => set('exchange_rate', parseFloat(e.target.value) || 1)} className="mono-inp" />
                </Field>
              )}
              <Field label="Incoterm">
                <UiSel value={form.incoterm} onChange={v => set('incoterm', v)}
                  options={[{ value: '', label: 'Select Incoterm…' }, ...INCOTERMS.map(i => ({ value: i, label: i }))]} />
              </Field>
              <Field label="Terms of Payment"><Inp value={form.terms_of_payment} onChange={e => set('terms_of_payment', e.target.value)} placeholder="90 DAYS FROM DATE OF INVOICE" /></Field>
            </div>
          </div>

          {/* Consignee */}
          <div ref={el => refs.current['consignee'] = el} className="form-sec">
            <div className="sec-hdr">
              <div className="sec-icon"><Icon id="users" sz={12} /></div>
              <div><div className="sec-title">Consignee &amp; Buyer</div>
                <div className="sec-desc">Maintain consignee and buyer identity exactly as required in shipping documents.</div></div>
            </div>
            <div className="grid-2">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Consignee Name *"><Inp value={form.consignee_name} onChange={e => set('consignee_name', e.target.value)} placeholder="CTR CO.,LTD." /></Field>
                <Field label="Consignee Address *"><UiText value={form.consignee_address} onChange={e => set('consignee_address', e.target.value)} placeholder="Full mailing address…" rows={4} /></Field>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Buyer (if other than consignee)"><UiText value={form.buyer_if_other} onChange={e => set('buyer_if_other', e.target.value)} placeholder="Leave blank if same as consignee" rows={4} /></Field>
                <Field label="Country of Origin"><Inp value={form.country_of_origin} onChange={e => set('country_of_origin', e.target.value)} /></Field>
                <Field label="Country of Destination"><Inp value={form.country_of_destination} onChange={e => set('country_of_destination', e.target.value)} placeholder="SOUTH KOREA" /></Field>
              </div>
            </div>
          </div>

          {/* Shipping */}
          <div ref={el => refs.current['shipping'] = el} className="form-sec">
            <div className="sec-hdr">
              <div className="sec-icon"><Icon id="ship" sz={12} /></div>
              <div><div className="sec-title">Shipping Details</div>
                <div className="sec-desc">Port and movement information used in invoice, packing list, and exports.</div></div>
            </div>
            <div className="grid-3">
              {[['Pre-Carriage by', 'pre_carriage_by', 'BY ROAD'], ['Place of Receipt', 'place_of_receipt', 'CHENNAI'], ['Pre-Carrier', 'pre_carrier', 'CHENNAI'], ['Vessel', 'vessel', 'MSC ANNA / TESSA'], ['Port of Loading', 'port_of_loading', 'CHENNAI'], ['Port of Discharge', 'port_of_discharge', 'BUSAN'], ['Final Destination', 'final_destination', 'SOUTH KOREA']].map(([label, key, ph]) => (
                <Field key={key} label={label}><Inp value={form[key] || ''} onChange={e => set(key, e.target.value)} placeholder={ph} /></Field>
              ))}
            </div>
          </div>

          {/* Goods */}
          <div ref={el => refs.current['goods'] = el} className="form-sec">
            <div className="sec-hdr">
              <div className="sec-icon"><Icon id="box" sz={12} /></div>
              <div><div className="sec-title">Goods</div>
                <div className="sec-desc">Product line items: part number, description, quantity and rate.</div></div>
              <div style={{ marginLeft: 'auto' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.show_sa_number} onChange={e => set('show_sa_number', e.target.checked)} style={{ accentColor: 'var(--primary)', width: 13, height: 13 }} />
                  Show SA #
                </label>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl goods-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>Sr</th>
                    {form.show_sa_number && <th>SA#</th>}
                    <th>Part No.</th>
                    <th style={{ minWidth: 200 }}>Description</th>
                    <th>Marks</th>
                    <th>Pkgs</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Rate ({form.currency})</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ width: 28 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td className="muted-cell" style={{ fontSize: 11, textAlign: 'center' }}>{it.sr_no}</td>
                      {form.show_sa_number && <td><input className="inp inp-sm" value={it.sa_number} onChange={e => updItem(i, 'sa_number', e.target.value)} placeholder="SA-001" style={{ width: 72 }} /></td>}
                      <td><input className="inp inp-sm mono-inp" value={it.part_number} onChange={e => updItem(i, 'part_number', e.target.value)} placeholder="ICK-001" style={{ width: 100 }} /></td>
                      <td><input className="inp inp-sm" value={it.description} onChange={e => updItem(i, 'description', e.target.value)} placeholder="Description of goods" style={{ minWidth: 180 }} /></td>
                      <td><input className="inp inp-sm" value={it.marks_nos} onChange={e => updItem(i, 'marks_nos', e.target.value)} placeholder="INZI/ICK/1" style={{ width: 90 }} /></td>
                      <td><input className="inp inp-sm" value={it.no_of_pkgs} onChange={e => updItem(i, 'no_of_pkgs', e.target.value)} style={{ width: 44 }} /></td>
                      <td><input className="inp inp-sm" type="number" value={it.quantity} onChange={e => updItem(i, 'quantity', parseFloat(e.target.value) || 0)} style={{ width: 52 }} /></td>
                      <td><input className="inp inp-sm" value={it.unit} onChange={e => updItem(i, 'unit', e.target.value)} style={{ width: 48 }} /></td>
                      <td><input className="inp inp-sm mono-inp" type="number" value={it.unit_price} onChange={e => updItem(i, 'unit_price', parseFloat(e.target.value) || 0)} style={{ width: 80 }} /></td>
                      <td style={{ textAlign: 'right' }}><span className="mono-cell">{fmtAmt(it.total_amount)}</span></td>
                      <td><Btn v="ghost" sz="icon" onClick={() => removeItem(i)} title="Remove row"><Icon id="minus" sz={10} /></Btn></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={form.show_sa_number ? 9 : 8} style={{ paddingTop: 6 }}>
                      <Btn v="ghost" sz="xs" onClick={addItem}><Icon id="plus" sz={10} /> Add Item</Btn>
                    </td>
                    <td style={{ textAlign: 'right', paddingTop: 6 }}>
                      <span className="mono-cell" style={{ fontWeight: 700, color: 'var(--primary)' }}>{fmtAmt(totalAmt)}</span>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Packing */}
          <div ref={el => refs.current['packing'] = el} className="form-sec">
            <div className="sec-hdr">
              <div className="sec-icon"><Icon id="boxes" sz={12} /></div>
              <div><div className="sec-title">Packing Details</div>
                <div className="sec-desc">Per-line packing: marks &amp; numbers, packages, and carton dimensions.</div></div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl goods-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>Sr</th>
                    <th>Marks &amp; Nos</th>
                    <th>No. of Pkgs</th>
                    <th>Dimensions</th>
                    <th>Unit</th>
                    <th style={{ width: 28 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {packing.map((pk, i) => (
                    <tr key={i}>
                      <td className="muted-cell" style={{ fontSize: 11, textAlign: 'center' }}>{pk.sr_no}</td>
                      <td><input className="inp inp-sm" value={pk.marks_nos} onChange={e => updPack(i, 'marks_nos', e.target.value)} placeholder="INZI/ICK/1" /></td>
                      <td><input className="inp inp-sm" value={pk.no_of_pkgs} onChange={e => updPack(i, 'no_of_pkgs', e.target.value)} style={{ width: 60 }} /></td>
                      <td><input className="inp inp-sm" value={pk.dimensions} onChange={e => updPack(i, 'dimensions', e.target.value)} placeholder="60×40×30" /></td>
                      <td>
                        <select className="inp inp-sm" value={pk.dimensions_unit} onChange={e => updPack(i, 'dimensions_unit', e.target.value)} style={{ width: 64 }}>
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td><Btn v="ghost" sz="icon" onClick={() => remPack(i)}><Icon id="minus" sz={10} /></Btn></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={6} style={{ paddingTop: 6 }}><Btn v="ghost" sz="xs" onClick={addPack}><Icon id="plus" sz={10} /> Add Row</Btn></td></tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Weight & Notes */}
          <div ref={el => refs.current['weights'] = el} className="form-sec" style={{ marginBottom: 64 }}>
            <div className="sec-hdr">
              <div className="sec-icon"><Icon id="weight" sz={12} /></div>
              <div><div className="sec-title">Weight &amp; Notes</div>
                <div className="sec-desc">Shipment weight and additional commercial remarks.</div></div>
            </div>
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <Field label="Net Weight"><Inp value={form.net_weight} onChange={e => set('net_weight', e.target.value)} placeholder="405.20 kgs" /></Field>
              <Field label="Gross Weight"><Inp value={form.gross_weight} onChange={e => set('gross_weight', e.target.value)} placeholder="420.0 kgs" /></Field>
            </div>
            <Field label="Additional Notes"><UiText value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Any additional commercial remarks…" /></Field>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Invoice PDF Preview ────────────────────────────────────────────────────
function InvoicePDFPreview({ invoice: inv }) {
  if (!inv) return null;
  const totalAmt = (inv.items || []).reduce((s, it) => s + it.total_amount, 0);
  const totalQty = (inv.items || []).reduce((s, it) => s + it.quantity, 0);
  const rateLabel = inv.incoterm ? `${inv.incoterm} ${inv.currency}` : inv.currency;
  const refRows = [
    ['Invoice No. &amp; Date', `${inv.invoice_number}     ${formatDate(inv.invoice_date)}`],
    ["Buyer's Order No.", inv.buyer_order_no || '—'],
    ['Duty Drawback Under', inv.duty_drawback || '—'],
    ['Bank AD Code', COMPANY.bank_ad_code],
    ['HS Code', inv.hs_code || '—'],
    ['LUT ARN No.', `${COMPANY.lut_arn_no} dated ${formatDate(COMPANY.lut_arn_date)}`],
  ];

  return (
    <div className="inv-doc-outer">
      <div className="inv-doc">
        {/* Header */}
        <div className="inv-doc-header">
          <div className="inv-hdr-logo">
            <div style={{ fontWeight: 800, fontSize: 10, letterSpacing: 0.3 }}>{COMPANY.name}</div>
          </div>
          <div className="inv-hdr-title">INVOICE CUM PACKING LIST</div>
          <div className="inv-hdr-mode">
            <div className="inv-label-sm">TRANSPORT MODE</div>
            <div style={{ fontWeight: 700, fontSize: 9 }}>{inv.transport_mode}</div>
          </div>
        </div>

        {/* Exporter + Refs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #000' }}>
          <div style={{ width: '48%', padding: '7px 8px', borderRight: '1px solid #000' }}>
            <div className="inv-label-sm">EXPORTER</div>
            <div style={{ fontWeight: 700, fontSize: 9, marginBottom: 3 }}>{COMPANY.name}</div>
            <div style={{ fontSize: 8, lineHeight: 1.65, whiteSpace: 'pre-line' }}>{COMPANY.address}</div>
            <div style={{ fontSize: 8, marginTop: 4, lineHeight: 1.8 }}>
              <div>GSTIN: {COMPANY.gstin}</div>
              <div>IEC: {COMPANY.iec}</div>
              <div>PAN: {COMPANY.pan}</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            {refRows.map(([label, value], i) => (
              <div key={i} className={cls('inv-ref-row', i === 0 && 'inv-ref-highlight')}>
                <span className="inv-ref-label" dangerouslySetInnerHTML={{ __html: label }} />
                <span className="inv-ref-value">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Consignee + Buyer */}
        <div style={{ display: 'flex', borderBottom: '1px solid #000' }}>
          <div style={{ width: '50%', padding: '7px 8px', borderRight: '1px solid #000' }}>
            <div className="inv-label-sm">CONSIGNEE</div>
            <div style={{ fontWeight: 700, fontSize: 9, marginBottom: 2 }}>{inv.consignee_name}</div>
            <div style={{ fontSize: 8, lineHeight: 1.65, whiteSpace: 'pre-line', marginBottom: 6 }}>{inv.consignee_address}</div>
            {[['Pre-Carriage by', inv.pre_carriage_by], ['Place of Receipt', inv.place_of_receipt], ['Vessel', inv.vessel || 'N/A'], ['Port of Loading', inv.port_of_loading], ['Port of Discharge', inv.port_of_discharge], ['Final Destination', inv.final_destination]].map(([l, v]) => (
              <div key={l} className="inv-ship-row"><span>{l}:</span><span>{v || '—'}</span></div>
            ))}
          </div>
          <div style={{ flex: 1, padding: '7px 8px' }}>
            <div className="inv-label-sm">BUYER (IF OTHER THAN CONSIGNEE)</div>
            <div style={{ fontSize: 8, minHeight: 28, whiteSpace: 'pre-line', marginBottom: 6, lineHeight: 1.65 }}>{inv.buyer_if_other || ' '}</div>
            {[['Country of Origin', inv.country_of_origin], ['Country of Destination', inv.country_of_destination], ['Terms of Payment', inv.terms_of_payment], ['Incoterm / Delivery Terms', rateLabel]].map(([l, v]) => (
              <div key={l} className="inv-ship-row"><span>{l}:</span><span>{v || '—'}</span></div>
            ))}
          </div>
        </div>

        {/* Goods */}
        <table className="inv-goods-tbl">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>Sr</th>
              {inv.show_sa_number && <th style={{ width: '9%' }}>SA No.</th>}
              <th style={{ width: inv.show_sa_number ? '13%' : '15%' }}>Part No.</th>
              <th>Description of Goods</th>
              <th style={{ width: '9%' }}>Qty</th>
              <th style={{ width: '13%' }}>Rate<br /><span style={{ fontSize: 7, fontWeight: 400 }}>{rateLabel}</span></th>
              <th style={{ width: '13%' }}>Amount<br /><span style={{ fontSize: 7, fontWeight: 400 }}>{inv.currency}</span></th>
            </tr>
          </thead>
          <tbody>
            {(inv.items || []).map((it, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>{it.sr_no}</td>
                {inv.show_sa_number && <td>{it.sa_number}</td>}
                <td style={{ fontFamily: 'monospace', fontSize: 7 }}>{it.part_number}</td>
                <td>{it.description}</td>
                <td style={{ textAlign: 'center' }}>{it.quantity} {it.unit}</td>
                <td style={{ textAlign: 'right' }}>{it.unit_price > 0 ? fmtAmt(it.unit_price) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{it.total_amount > 0 ? fmtAmt(it.total_amount) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="inv-total-row">
              <td colSpan={inv.show_sa_number ? 4 : 3} style={{ textAlign: 'right' }}><strong>TOTAL</strong></td>
              <td style={{ textAlign: 'center' }}><strong>{totalQty} NOS</strong></td>
              <td></td>
              <td style={{ textAlign: 'right' }}><strong>{fmtAmt(totalAmt)}</strong></td>
            </tr>
          </tfoot>
        </table>

        {/* Words */}
        <div className="inv-words-row">
          <strong>IN WORDS:</strong>&nbsp;&nbsp;{amountInWords(totalAmt, inv.currency)}
        </div>

        {/* Packing */}
        <div className="inv-section-bar">PACKING LIST</div>
        <table className="inv-goods-tbl">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>Sr</th>
              <th style={{ width: '25%' }}>Marks &amp; Nos</th>
              <th style={{ width: '15%' }}>No. of Pkgs</th>
              <th>Dimensions</th>
              <th style={{ width: '10%' }}>Unit</th>
            </tr>
          </thead>
          <tbody>
            {(inv.packing_list || []).length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#777', padding: '8px', fontSize: 8 }}>No packing list entries</td></tr>
            ) : (inv.packing_list || []).map((pk, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>{pk.sr_no}</td>
                <td>{pk.marks_nos}</td>
                <td style={{ textAlign: 'center' }}>{pk.no_of_pkgs}</td>
                <td>{pk.dimensions}</td>
                <td>{pk.dimensions_unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="inv-weight-bar">
          <span><strong>Net Weight:</strong> {inv.net_weight || '—'}</span>
          <span><strong>Gross Weight:</strong> {inv.gross_weight || '—'}</span>
        </div>

        {/* Footer */}
        <div className="inv-footer-row">
          <div className="inv-declaration">
            <div style={{ fontSize: 8, fontStyle: 'italic', marginBottom: 4 }}>
              Export under LUT ARN: {COMPANY.lut_arn_no} dated {formatDate(COMPANY.lut_arn_date)}
            </div>
            <div style={{ fontSize: 8 }}>We certify that the particulars given above are true and correct and that the goods are of Indian origin.</div>
          </div>
          <div className="inv-signature">
            <div style={{ fontSize: 8, marginBottom: 2 }}>For {COMPANY.name}</div>
            <div style={{ height: 36, borderBottom: '1px solid #000', marginBottom: 4 }}></div>
            <div style={{ fontSize: 8 }}>Place: {COMPANY.place}</div>
            <div style={{ fontSize: 8 }}>Date: {formatDate(inv.invoice_date)}</div>
            <div style={{ fontSize: 8, fontWeight: 700, marginTop: 4 }}>{COMPANY.signatory_name}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Invoice Detail ──────────────────────────────────────────────────────────
function InvoiceDetail({ params = {} }) {
  const { onNavigate } = useNav();
  const [toastMsg, setToastMsg] = useState('');
  const invoice = INVOICES.find(i => i.id === params.id) || INVOICES[0];
  const isFinal = invoice.status === 'final';

  const toast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); };

  return (
    <div className="page-wrap">
      {toastMsg && <div className="toast-msg"><Icon id="check" sz={11} /> {toastMsg}</div>}

      <PageHeader
        back backRoute="invoices"
        title={invoice.invoice_number}
        sub={`${invoice.consignee_name} · ${formatDate(invoice.invoice_date)} · ${invoice.currency}`}
        actions={<>
          <Badge status={invoice.status}>{isFinal ? 'Final' : 'Draft'}</Badge>
          <Btn v="outline" sz="sm" onClick={() => onNavigate('invoices.new', { id: invoice.id })}><Icon id="edit" sz={11} /> Edit</Btn>
          {!isFinal && <Btn v="default" sz="sm" onClick={() => toast('Invoice finalized successfully')}><Icon id="check" sz={11} /> Finalize</Btn>}
          <Btn v="outline" sz="sm" onClick={() => toast('PDF exported — check your downloads')}><Icon id="pdf" sz={11} /> Export PDF</Btn>
          <Btn v="outline" sz="sm" onClick={() => toast('Excel exported — check your downloads')}><Icon id="excel" sz={11} /> Export Excel</Btn>
          <Btn v="danger" sz="sm" onClick={() => onNavigate('invoices')}><Icon id="trash" sz={11} /> Delete</Btn>
        </>}
      />

      <InvoicePDFPreview invoice={invoice} />
    </div>
  );
}

Object.assign(window, { InvoiceList, InvoiceNew, InvoiceDetail, InvoicePDFPreview });
