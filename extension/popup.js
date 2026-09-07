const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
let allWords = [];

const escapeHtml = (str) => String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function render(filter = '') {
  const safeFilter = String(filter).toLowerCase().trim();
  const filtered = allWords.filter(w => w && w.word && w.word.toLowerCase().includes(safeFilter));
  
  const displayList = filter ? filtered : filtered.slice(0, 5);
  
  listEl.innerHTML = '';
  
  if (allWords.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 36px 16px; color:#9ca3af; font-size:13px; line-height:1.6;">
        <div style="font-size:32px; margin-bottom:8px;">📖</div>
        <div style="font-weight:500; color:#6b7280;">暂无生词记录</div>
        <div style="font-size:12px; color:#9ca3af; margin-top:4px;">在网页中选中生词点击 ➕ 即可收录</div>
      </div>
    `;
    document.getElementById('total').textContent = '0';
    document.getElementById('review-today').textContent = '0';
    return;
  }

  if (displayList.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 28px 16px; color:#9ca3af; font-size:13px;">
        未找到包含 "${escapeHtml(filter)}" 的生词
      </div>
    `;
    return;
  }
  
  displayList.forEach(w => {
    const isMastered = w.reviewStage === -1;
    const div = document.createElement('div');
    div.className = `item ${isMastered ? 'mastered' : ''}`;
    const meaningHtml = w.meaning ? `<div style="font-size:12px; margin-top:4px; color:#2563eb;">${escapeHtml(w.phonetic || '')} ${escapeHtml(w.meaning)}</div>` : '';
    
    div.innerHTML = `
      <div class="word" style="${w.isPinned ? 'color:#d97706;' : ''}">${w.isPinned ? '📌 ' : ''}${escapeHtml(w.word)}</div>
      <div class="context">${escapeHtml(w.context || '')}</div>
      ${meaningHtml}
      <div class="actions">
        <button class="btn-master" data-id="${w.id}">${isMastered ? '已掌握' : '标为掌握'}</button>
        <button class="btn-del" data-id="${w.id}">删除</button>
      </div>
    `;
    listEl.appendChild(div);
  });

  if (allWords.length > 5 && !filter) {
    const footerDiv = document.createElement('div');
    footerDiv.style.cssText = 'text-align:center; padding:10px 12px; background:#fff; border-top:1px solid #f3f4f6;';
    footerDiv.innerHTML = `<a id="link-open-dashboard" style="color:#3b82f6; font-size:12px; cursor:pointer; text-decoration:none; font-weight:500;">查看全部 ${allWords.length} 个单词（进入总览）→</a>`;
    footerDiv.querySelector('#link-open-dashboard').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
    listEl.appendChild(footerDiv);
  }
  
  document.getElementById('total').textContent = allWords.length;
  const now = new Date().toISOString();
  document.getElementById('review-today').textContent = allWords.filter(w => w && w.reviewStage !== -1 && w.nextReviewTime && w.nextReviewTime <= now).length;
}

function loadAndRender() {
    chrome.storage.local.get({ words: [] }, (res) => {
        const raw = Array.isArray(res.words) ? res.words.filter(Boolean) : [];
        allWords = raw.slice().reverse();
        render(searchEl.value);
    });
}

searchEl.addEventListener('input', (e) => render(e.target.value));

listEl.addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') return;
  const id = parseInt(e.target.dataset.id);
  
  chrome.storage.local.get({ words: [] }, (res) => {
    let currentWords = res.words;
    
    if (e.target.classList.contains('btn-del')) {
        if (!confirm('确定要删除这个单词吗？此操作不可恢复。')) return;
        currentWords = currentWords.filter(w => w.id !== id);
    } else if (e.target.classList.contains('btn-master')) {
        const w = currentWords.find(w => w.id === id);
        if (w) w.reviewStage = w.reviewStage === -1 ? 0 : -1;
    }
    
    chrome.storage.local.set({ words: currentWords }, loadAndRender);
  });
});

chrome.storage.local.get({ targetLang: 'zh-CN' }, (res) => {
    document.getElementById('target-lang').value = res.targetLang;
});

document.getElementById('target-lang').addEventListener('change', (e) => {
    chrome.storage.local.set({ targetLang: e.target.value });
});

loadAndRender();

document.getElementById('btn-review').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

document.getElementById('btn-export').addEventListener('click', () => {
    chrome.storage.local.get({ words: [], isPaid: false }, (res) => {
        if (res.isPaid) {
            let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
            csvContent += "Word,Context,Meaning,Phonetic,ReviewStage\n";
            
            res.words.forEach(w => {
                const escape = (str) => '"' + ((str || '').replace(/"/g, '""')) + '"';
                csvContent += escape(w.word) + ',' + escape(w.context) + ',' + escape(w.meaning) + ',' + escape(w.phonetic) + ',' + w.reviewStage + "\n";
            });
            
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "wordcatcher_export.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            if (confirm("【高级版功能】导出 CSV 词库是高级版专属功能。\n是否立即解锁无限制高级版？")) {
                chrome.runtime.sendMessage({ action: "open_payment" });
            }
            chrome.runtime.sendMessage({ action: "sync_payment" });
        }
    });
});
