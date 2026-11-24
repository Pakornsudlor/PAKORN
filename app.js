(() => {
  'use strict';

  const STORAGE_KEY = 'pakorn-expense-tracker-v1';
  const CATEGORIES = {
    expense: ['อาหาร', 'เดินทาง', 'ที่พัก/ค่าเช่า', 'สาธารณูปโภค', 'ช้อปปิ้ง', 'สุขภาพ', 'บันเทิง', 'การศึกษา', 'อื่นๆ'],
    income: ['เงินเดือน', 'งานเสริม', 'โบนัส', 'ดอกเบี้ย/ปันผล', 'อื่นๆ'],
  };

  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' });

  let transactions = load();
  let currentMonth = todayISO().slice(0, 7);
  let editingId = null;

  // ---------- storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data.filter(isValidTx) : [];
    } catch {
      return [];
    }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    } catch {
      alert('บันทึกข้อมูลไม่สำเร็จ (เบราว์เซอร์อาจปิดการเก็บข้อมูล)');
    }
  }
  function isValidTx(t) {
    return t && typeof t.id === 'string'
      && (t.type === 'income' || t.type === 'expense')
      && typeof t.amount === 'number' && isFinite(t.amount) && t.amount > 0
      && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
      && typeof t.category === 'string';
  }

  // ---------- helpers ----------
  function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function uid() {
    return (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function selectedType() {
    return document.querySelector('input[name="type"]:checked').value;
  }
  function fillCategories(type, selected) {
    const sel = $('category');
    sel.innerHTML = '';
    for (const c of CATEGORIES[type]) {
      const o = document.createElement('option');
      o.value = o.textContent = c;
      sel.appendChild(o);
    }
    if (selected) {
      if (!CATEGORIES[type].includes(selected)) {
        const o = document.createElement('option');
        o.value = o.textContent = selected;
        sel.appendChild(o);
      }
      sel.value = selected;
    }
  }
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- render ----------
  function render() {
    $('monthPicker').value = currentMonth;
    const monthTx = transactions
      .filter((t) => t.date.startsWith(currentMonth))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

    let income = 0, expense = 0;
    for (const t of monthTx) t.type === 'income' ? (income += t.amount) : (expense += t.amount);
    $('sumIncome').textContent = fmt.format(income);
    $('sumExpense').textContent = fmt.format(expense);
    const bal = income - expense;
    $('sumBalance').textContent = fmt.format(bal);
    $('sumBalance').style.color = bal < 0 ? 'var(--expense)' : '';

    renderBreakdown(monthTx, expense);
    renderList(monthTx);
  }

  function renderBreakdown(monthTx, total) {
    const box = $('breakdown');
    box.innerHTML = '';
    const byCat = {};
    for (const t of monthTx) if (t.type === 'expense') byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    if (!rows.length) {
      box.innerHTML = '<p class="empty">ยังไม่มีรายจ่าย</p>';
      return;
    }
    const max = rows[0][1];
    for (const [cat, val] of rows) {
      const row = document.createElement('div');
      row.className = 'row';
      const pct = total ? Math.round((val / total) * 100) : 0;
      row.innerHTML = `<span></span><div class="track"><div class="fill"></div></div><span class="val"></span>`;
      row.children[0].textContent = cat;
      row.querySelector('.fill').style.width = `${(val / max) * 100}%`;
      row.children[2].textContent = `${fmt.format(val)} (${pct}%)`;
      box.appendChild(row);
    }
  }

  function renderList(monthTx) {
    const list = $('txList');
    const filter = $('filterType').value;
    const shown = monthTx.filter((t) => filter === 'all' || t.type === filter);
    list.innerHTML = '';
    $('emptyMsg').hidden = shown.length > 0;
    for (const t of shown) {
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="tx-main"><div class="cat"></div><div class="meta"></div></div>
        <div class="amt ${t.type}"></div>
        <div class="row-btns"><button data-act="edit">แก้ไข</button><button data-act="del">ลบ</button></div>`;
      li.querySelector('.cat').textContent = t.category;
      const [y, m, d] = t.date.split('-').map(Number);
      li.querySelector('.meta').textContent = dateFmt.format(new Date(y, m - 1, d)) + (t.note ? ` · ${t.note}` : '');
      li.querySelector('.amt').textContent = (t.type === 'income' ? '+' : '−') + fmt.format(t.amount);
      li.querySelector('[data-act="edit"]').onclick = () => startEdit(t.id);
      li.querySelector('[data-act="del"]').onclick = () => remove(t.id);
      list.appendChild(li);
    }
  }

  // ---------- actions ----------
  function resetForm() {
    editingId = null;
    $('txForm').reset();
    $('date').value = currentMonth === todayISO().slice(0, 7) ? todayISO() : `${currentMonth}-01`;
    fillCategories(selectedType());
    $('formTitle').textContent = 'เพิ่มรายการ';
    $('submitBtn').textContent = 'บันทึก';
    $('cancelEdit').hidden = true;
  }

  function startEdit(id) {
    const t = transactions.find((x) => x.id === id);
    if (!t) return;
    editingId = id;
    document.querySelector(`input[name="type"][value="${t.type}"]`).checked = true;
    fillCategories(t.type, t.category);
    $('amount').value = t.amount;
    $('date').value = t.date;
    $('note').value = t.note || '';
    $('formTitle').textContent = 'แก้ไขรายการ';
    $('submitBtn').textContent = 'บันทึกการแก้ไข';
    $('cancelEdit').hidden = false;
    $('txForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('amount').focus();
  }

  function remove(id) {
    if (!confirm('ลบรายการนี้?')) return;
    transactions = transactions.filter((t) => t.id !== id);
    if (editingId === id) resetForm();
    save();
    render();
  }

  $('txForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = Math.round(parseFloat($('amount').value) * 100) / 100;
    if (!(amount > 0)) return;
    const data = {
      type: selectedType(),
      amount,
      date: $('date').value,
      category: $('category').value,
      note: $('note').value.trim(),
    };
    if (editingId) {
      const t = transactions.find((x) => x.id === editingId);
      if (t) Object.assign(t, data);
    } else {
      transactions.push({ id: uid(), createdAt: Date.now(), ...data });
    }
    save();
    currentMonth = data.date.slice(0, 7);
    resetForm();
    render();
  });

  document.querySelectorAll('input[name="type"]').forEach((r) =>
    r.addEventListener('change', () => fillCategories(selectedType())));
  $('cancelEdit').onclick = resetForm;
  $('filterType').onchange = render;
  $('prevMonth').onclick = () => { currentMonth = shiftMonth(currentMonth, -1); if (!editingId) resetForm(); render(); };
  $('nextMonth').onclick = () => { currentMonth = shiftMonth(currentMonth, 1); if (!editingId) resetForm(); render(); };
  $('monthPicker').onchange = (e) => { if (e.target.value) { currentMonth = e.target.value; if (!editingId) resetForm(); render(); } };

  // ---------- backup ----------
  $('exportJson').onclick = () =>
    download(`transactions-${todayISO()}.json`, JSON.stringify(transactions, null, 2), 'application/json');

  $('exportCsv').onclick = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['วันที่', 'ประเภท', 'หมวดหมู่', 'จำนวนเงิน', 'บันทึก'].map(esc).join(',')];
    for (const t of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
      lines.push([t.date, t.type === 'income' ? 'รายรับ' : 'รายจ่าย', t.category, t.amount.toFixed(2), t.note].map(esc).join(','));
    }
    // BOM so Excel reads Thai text as UTF-8
    download(`transactions-${todayISO()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  };

  $('importJson').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error();
      const valid = data.filter(isValidTx);
      const ids = new Set(transactions.map((t) => t.id));
      const added = valid.filter((t) => !ids.has(t.id));
      transactions.push(...added.map((t) => ({ createdAt: 0, note: '', ...t })));
      save();
      render();
      alert(`นำเข้า ${added.length} รายการ (ข้าม ${data.length - added.length} รายการที่ซ้ำหรือไม่ถูกต้อง)`);
    } catch {
      alert('ไฟล์ไม่ถูกต้อง');
    }
  };

  resetForm();
  render();
})();
