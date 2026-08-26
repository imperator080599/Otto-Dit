function table(cols, rows, opts){
  opts = opts || {};
  const th = cols.map(c => `<th class="${c.n ? 'n' : ''}">${esc(c.t)}</th>`).join('');
  const tb = rows.map(r => '<tr>' + cols.map(c => {
    const v = r[c.k];
    return `<td class="${c.n ? 'n' : ''} ${c.cls || ''} ${r._cls && r._cls[c.k] || ''}">${v === undefined || v === null ? '' : v}</td>`;
  }).join('') + '</tr>').join('');
  const tf = opts.foot ? '<tfoot><tr>' + cols.map(c => `<td class="${c.n ? 'n' : ''}">${opts.foot[c.k] === undefined ? '' : opts.foot[c.k]}</td>`).join('') + '</tr></tfoot>' : '';
  return `<div class="tw"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody>${tf}</table></div>`;
}

/* ═══ 7. MODULE 1 — IMPORT ET RAPPROCHEMENT ═══════════════════════════════ */