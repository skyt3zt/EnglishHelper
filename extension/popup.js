const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
let allWords = [];

function render(filter = '') {
  const safeFilter = String(filter).toLowerCase();
  const filtered = allWords.filter(w => w && w.word && w.word.toLowerCase().includes(safeFilter));
  
  // Ponytail: Only show latest 5 words if no search filter is active
  const displayList = filter ? filtered : filtered.slice(0, 5);
  
  listEl.innerHTML = '';
  
  displayList.forEach(w => {
    const isMastered = w.reviewStage === -1;
    const div = document.createElement('div');
    div.className = `item ${isMastered ? 'mastered' : ''}`;
    // ponytail: Render meaning if it exists. If not, phase 3 handles fetching. YAGNI to fetch in list view.
    const meaningHtml = w.meaning ? `<div style="font-size:12px; margin-top:4px; color:#2563eb;">${w.phonetic || ''} ${w.meaning}</div>` : '';
    
    div.innerHTML = `
      <div class="word" style="${w.isPinned ? 'color:#d97706;' : ''}">${w.isPinned ? '📌 ' : ''}${w.word}</div>
      <div class="context">${w.context}</div>
      ${meaningHtml}
      <div class="actions">
        <button class="btn-master" data-id="${w.id}">${isMastered ? '已掌握' : '标为掌握'}</button>
        <button class="btn-del" data-id="${w.id}">删除</button>
      </div>
    `;
    listEl.appendChild(div);
  });
  
  // stats
  document.getElementById('total').textContent = allWords.length;
  const now = new Date().toISOString();
  document.getElementById('review-today').textContent = allWords.filter(w => w.reviewStage !== -1 && w.nextReviewTime <= now).length;
}

function loadAndRender() {
    chrome.storage.local.get({ words: [] }, (res) => {
        allWords = (Array.isArray(res.words) ? res.words : []).reverse(); // Newest first
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

// Initial load
chrome.storage.local.get({ targetLang: 'zh-CN' }, (res) => {
    document.getElementById('target-lang').value = res.targetLang;
});

document.getElementById('target-lang').addEventListener('change', (e) => {
    chrome.storage.local.set({ targetLang: e.target.value });
});



document.getElementById('btn-reset-vip').addEventListener('click', () => {
    chrome.storage.local.remove('isPaidDemo', () => {
        alert('会员身份已重置！去刷新一下阅读网页，您现在是免费用户了！');
    });
});

document.getElementById('btn-enable-vip').addEventListener('click', () => {
    chrome.storage.local.set({ isPaidDemo: true }, () => {
        alert('🎉 模拟支付成功！您已开通无限制高级版，快去体验吧！');
    });
});

loadAndRender();

document.getElementById('btn-review').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

document.getElementById('btn-export').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "check_payment" }, (response) => {
        if (response && response.paid) {
            chrome.storage.local.get({ words: [] }, (res) => {
                let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // UTF-8 BOM
                csvContent += "Word,Context,Meaning,Phonetic,ReviewStage\n";
                
                res.words.forEach(w => {
                    const escape = (str) => `"${(str || '').replace(/"/g, '""')}"`;
                    csvContent += `${escape(w.word)},${escape(w.context)},${escape(w.meaning)},${escape(w.phonetic)},${w.reviewStage}\n`;
                });
                
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", "wordcatcher_export.csv");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        } else {
            if (confirm("【高级版功能】导出 CSV 词库是高级版专属功能。\n是否立即解锁无限制高级版？")) {
                chrome.runtime.sendMessage({ action: "open_payment" });
            }
        }
    });
});
