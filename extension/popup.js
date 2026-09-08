const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const targetLangEl = document.getElementById('target-lang');
const vipBadgeEl = document.getElementById('vip-status');
const totalEl = document.getElementById('total');
const reviewTodayEl = document.getElementById('review-today');

let allWords = [];

const escapeHtml = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function applyVipBadge(isPaid) {
  if (!vipBadgeEl) return;
  if (isPaid) {
    vipBadgeEl.textContent = '👑 VIP版';
    vipBadgeEl.style.background = '#fef3c7';
    vipBadgeEl.style.color = '#d97706';
    vipBadgeEl.title = '您已激活无限制 VIP 权限';
  } else {
    vipBadgeEl.textContent = '免费版';
    vipBadgeEl.style.background = '#e5e7eb';
    vipBadgeEl.style.color = '#4b5563';
    vipBadgeEl.title = '点击可同步检测 VIP 状态或登录';
  }
}

function render(filter = '') {
  const safeFilter = String(filter).toLowerCase().trim();
  const filtered = safeFilter
    ? allWords.filter(w => w && w.word && w.word.toLowerCase().includes(safeFilter))
    : allWords;

  const totalCount = allWords.length;
  if (totalEl) totalEl.textContent = totalCount;

  const now = new Date().toISOString();
  if (reviewTodayEl) {
    reviewTodayEl.textContent = allWords.filter(w => w && w.reviewStage !== -1 && w.nextReviewTime && w.nextReviewTime <= now).length;
  }

  if (totalCount === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 48px 16px; color:#9ca3af; font-size:13px; line-height:1.6;">
        <div style="font-size:32px; margin-bottom:8px;">📖</div>
        <div style="font-weight:500; color:#6b7280;">暂无生词记录</div>
        <div style="font-size:12px; color:#9ca3af; margin-top:4px;">在网页中选中生词点击 ➕ 即可收录</div>
      </div>
    `;
    return;
  }

  const displayList = safeFilter ? filtered : filtered.slice(0, 5);

  if (displayList.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 36px 16px; color:#9ca3af; font-size:13px;">
        未找到包含 "${escapeHtml(filter)}" 的生词
      </div>
    `;
    return;
  }

  let html = '';
  for (const w of displayList) {
    const isMastered = w.reviewStage === -1;
    const meaningHtml = w.meaning
      ? `<div style="font-size:12px; margin-top:4px; color:#2563eb; line-height:1.4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(w.meaning)}">${escapeHtml(w.phonetic || '')} ${escapeHtml(w.meaning)}</div>`
      : '';
    const contextHtml = w.context
      ? `<div class="context">${escapeHtml(w.context)}</div>`
      : '';

    html += `
      <div class="item ${isMastered ? 'mastered' : ''}">
        <div class="word" style="${w.isPinned ? 'color:#d97706;' : ''}">${w.isPinned ? '📌 ' : ''}${escapeHtml(w.word)}</div>
        ${contextHtml}
        ${meaningHtml}
        <div class="actions">
          <button class="btn-master" data-id="${w.id}">${isMastered ? '已掌握' : '标为掌握'}</button>
          <button class="btn-del" data-id="${w.id}">删除</button>
        </div>
      </div>
    `;
  }

  if (allWords.length > 5 && !safeFilter) {
    html += `
      <div style="text-align:center; padding:10px 12px; background:#fff; border-top:1px solid #f3f4f6;">
        <a id="link-open-dashboard" style="color:#3b82f6; font-size:12px; cursor:pointer; text-decoration:none; font-weight:500;">查看全部 ${allWords.length} 个单词（进入总览）→</a>
      </div>
    `;
  }

  listEl.innerHTML = html;
}

// Single unified load on popup open - zero blocking network calls
function initPopup() {
  console.log('[WordCatcher Popup] initPopup started');
  chrome.storage.local.get({ words: [], isPaid: false, targetLang: 'zh-CN' }, (res) => {
    console.log('[WordCatcher Popup] storage loaded in', Math.round(performance.now() - (window.__popupStartTime || 0)), 'ms');
    if (targetLangEl) targetLangEl.value = res.targetLang;
    applyVipBadge(res.isPaid);

    const raw = Array.isArray(res.words) ? res.words.filter(Boolean) : [];
    allWords = raw.slice().reverse();
    render(searchEl.value);
    console.log('[WordCatcher Popup] render finished in', Math.round(performance.now() - (window.__popupStartTime || 0)), 'ms');
  });
}

// Reactive storage changes listener
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.words) {
      const raw = Array.isArray(changes.words.newValue) ? changes.words.newValue.filter(Boolean) : [];
      allWords = raw.slice().reverse();
      render(searchEl.value);
    }
    if (changes.isPaid !== undefined) {
      applyVipBadge(changes.isPaid.newValue);
    }
  }
});

// Debounced search input
let searchDebounceTimer = null;
searchEl.addEventListener('input', (e) => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    render(e.target.value);
  }, 80);
});

// Event delegation on listEl
listEl.addEventListener('click', (e) => {
  if (e.target.id === 'link-open-dashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    return;
  }

  const btn = e.target.closest('button');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);

  chrome.storage.local.get({ words: [] }, (res) => {
    let currentWords = Array.isArray(res.words) ? res.words : [];

    if (btn.classList.contains('btn-del')) {
      if (!confirm('确定要删除这个单词吗？此操作不可恢复。')) return;
      currentWords = currentWords.filter(w => w.id !== id);
    } else if (btn.classList.contains('btn-master')) {
      const w = currentWords.find(w => w.id === id);
      if (w) w.reviewStage = w.reviewStage === -1 ? 0 : -1;
    }

    chrome.storage.local.set({ words: currentWords });
  });
});

if (targetLangEl) {
  targetLangEl.addEventListener('change', (e) => {
    chrome.storage.local.set({ targetLang: e.target.value });
  });
}

// Click to manually sync VIP status or open login
if (vipBadgeEl) {
  vipBadgeEl.addEventListener('click', () => {
    vipBadgeEl.textContent = '检测中...';
    chrome.runtime.sendMessage({ action: "sync_payment" }, (res) => {
      if (res && res.paid) {
        alert('🎉 恭喜！已成功检测并激活您的 VIP 权限！');
        applyVipBadge(true);
      } else {
        applyVipBadge(false);
        if (confirm('当前尚未检测到有效 VIP。\n若您已加入白名单或已付款，点击“确定”将为您打开账号登录激活页面。')) {
          chrome.runtime.sendMessage({ action: "open_login" });
        }
      }
    });
  });
}

document.getElementById('btn-review')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

document.getElementById('btn-export')?.addEventListener('click', () => {
  chrome.storage.local.get({ words: [], isPaid: false }, (res) => {
    if (res.isPaid) {
      let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
      csvContent += "Word,Context,Meaning,Phonetic,ReviewStage\n";

      (res.words || []).forEach(w => {
        const esc = (str) => '"' + ((str || '').replace(/"/g, '""')) + '"';
        csvContent += esc(w.word) + ',' + esc(w.context) + ',' + esc(w.meaning) + ',' + esc(w.phonetic) + ',' + w.reviewStage + "\n";
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "wordcatcher_export.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      chrome.runtime.sendMessage({ action: "sync_payment" }, (syncRes) => {
        if (syncRes && syncRes.paid) {
          applyVipBadge(true);
          document.getElementById('btn-export')?.click();
        } else {
          if (confirm("【高级版功能】导出 CSV 词库是高级版专属功能。\n若您已是白名单/付费用户，点击“确定”可打开登录激活页面。")) {
            chrome.runtime.sendMessage({ action: "open_login" });
          }
        }
      });
    }
  });
});

// Initialize on popup open
initPopup();
