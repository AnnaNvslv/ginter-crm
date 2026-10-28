// ── Analitika: prodaja sa sajta ──
// Blok na dnu Analitike: rezervacije okvira sa sajta i porudžbine nastale iz njih
// (orders.source = 'sajt'). Dodaje se oko renderFlBlock(), bez izmene analytics.js.
(function () {
  const baseRenderFl = window.renderFlBlock;
  window.renderFlBlock = function (ctx) {
    baseRenderFl(ctx);
    renderSiteBlock();
  };

  async function renderSiteBlock() {
    const wrap = document.getElementById('analytics-content');
    if (!wrap) return;
    let host = document.getElementById('analytics-site');
    if (!host) {
      wrap.insertAdjacentHTML('beforeend', '<div id="analytics-site"></div>');
      host = document.getElementById('analytics-site');
    }
    host.innerHTML = '<div class="analytics-section-title" style="margin-top:36px;">Prodaja sa sajta</div><div class="analytics-trend-note">Učitavanje...</div>';

    const [resR, ordR] = await Promise.all([
      sb.from('frame_reservations').select('id, status, created_at, order_id').order('created_at'),
      sb.from('orders').select('id, order_date, total_amount').eq('source', 'sajt').is('deleted_at', null),
    ]);
    if (resR.error || ordR.error) {
      host.innerHTML = '<div class="analytics-section-title" style="margin-top:36px;">Prodaja sa sajta</div><div class="analytics-trend-note">Greška pri učitavanju</div>';
      return;
    }
    const res = resR.data || [], ords = ordR.data || [];
    const n = v => fmtMoney(v).replace(' RSD', '');
    const pct = (a, b) => (b ? Math.round(a / b * 100) + '%' : '—');

    const cnt = s => res.filter(r => r.status === s).length;
    const total = res.length, bought = cnt('kupljena'), cancelled = cnt('otkazana');
    const active = res.filter(r => ['nova', 'kontaktirani', 'odlozena'].includes(r.status)).length;
    const closed = bought + cancelled;
    const promet = ords.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

    // poslednjih 12 meseci
    const months = [];
    const d = new Date(); d.setDate(1);
    for (let i = 0; i < 12; i++) { months.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() - 1); }
    const rowsHtml = months.map(ym => {
      const rm = res.filter(r => (r.created_at || '').slice(0, 7) === ym);
      const om = ords.filter(o => (o.order_date || '').slice(0, 7) === ym);
      if (!rm.length && !om.length) return '';
      const sum = om.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
      return `<tr style="cursor:default;"><td>${ym.slice(5)}.${ym.slice(0, 4)}.</td>
        <td class="num">${rm.length}</td><td class="num">${rm.filter(r => r.status === 'kupljena').length}</td>
        <td class="num">${rm.filter(r => r.status === 'otkazana').length}</td>
        <td class="num">${om.length}</td><td class="num">${n(sum)}</td></tr>`;
    }).join('');

    host.innerHTML = `
      <div class="analytics-section-title" style="margin-top:36px;">Prodaja sa sajta <span class="sub">— rezervacije okvira i porudžbine označene „Sa sajta"</span></div>
      <div class="metric-grid">
        <div class="metric-card"><div class="label">Rezervacija ukupno</div><div class="value">${total}</div><small>u radu: ${active}</small></div>
        <div class="metric-card"><div class="label">Kupljeno</div><div class="value">${bought}</div><small>otkazano: ${cancelled}</small></div>
        <div class="metric-card"><div class="label">Konverzija</div><div class="value">${pct(bought, closed)}</div><small>kupljene od zatvorenih</small></div>
        <div class="metric-card"><div class="label">Promet sa sajta</div><div class="value">${n(promet)}</div><small>porudžbina: ${ords.length}</small></div>
        <div class="metric-card"><div class="label">Prosečna porudžbina</div><div class="value">${ords.length ? n(promet / ords.length) : '—'}</div><small>sa sajta</small></div>
      </div>
      <div class="analytics-section-title">Po mesecima <span class="sub">— poslednjih 12 meseci; rezervacije po datumu prijema, porudžbine po datumu porudžbine</span></div>
      <div style="overflow-x:auto;">
      <table class="data-table" style="min-width:560px;">
        <thead><tr><th>Mesec</th><th class="num">Rezervacija</th><th class="num">Kupljeno</th><th class="num">Otkazano</th><th class="num">Porudžbina sa sajta</th><th class="num">Promet</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="6">Još nema rezervacija sa sajta</td></tr>'}</tbody>
      </table>
      </div>`;
  }
})();
