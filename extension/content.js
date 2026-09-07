let currentSelection = { text: '', context: '' };
let floatingBtnHost = null;

// Show button when text is selected
document.addEventListener('mouseup', (e) => {
  // Fast path: if the user just clicked (no text highlighted), exit immediately
  // to prevent unnecessary layout/string calculations on every single click.
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  const text = selection.toString().trim();
  
  // Basic heuristic to only capture words or short phrases, not whole sentences
  const wordCount = text.split(/\s+/).length;
  
  if (text && text.length > 0 && text.length < 40 && wordCount <= 3) {
    currentSelection = {
      text: text,
      // ponytail: Simplification ceiling: Just grabbing parentNode textContent. Upgrade path: use NLP sentence tokenizer or boundary walking to extract perfect sentence.
      context: selection.anchorNode?.parentNode?.textContent?.trim().substring(0, 200) || text
    };
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    showButton(rect);
  }
});

// Hide button when clicking elsewhere
document.addEventListener('mousedown', () => {
    hideButton();
});

function showButton(rect) {
  if (!floatingBtnHost) {
    floatingBtnHost = document.createElement('div');
    const shadow = floatingBtnHost.attachShadow({mode: 'open'});
    
    const btn = document.createElement('button');
    btn.textContent = '➕';
    // Use 'all: initial' to prevent host CSS bleed, and fixed positioning relative to viewport.
    btn.style.cssText = 'all: initial; position:fixed; z-index:2147483647; cursor:pointer; background:#fff; border:1px solid #ddd; border-radius:4px; padding:4px 8px; box-shadow:0 4px 6px rgba(0,0,0,0.1); font-size:14px;';
    
    btn.onmousedown = (e) => {
      e.preventDefault(); // Prevent text selection from clearing
      e.stopPropagation(); // Prevent document mousedown from hiding button
      saveWord();
    };
    
    btn.onmouseup = (e) => {
      e.stopPropagation(); // Prevent document mouseup from re-triggering showButton
    };
    
    shadow.appendChild(btn);
    document.body.appendChild(floatingBtnHost);
  }
  
  floatingBtnHost.style.display = 'block';
  const btn = floatingBtnHost.shadowRoot.querySelector('button');
  btn.textContent = '➕'; // Reset icon in case it was a checkmark
  btn.style.top = `${rect.bottom + 5}px`;
  btn.style.left = `${rect.left + (rect.width / 2)}px`;
}

function hideButton() {
  if (floatingBtnHost) {
    floatingBtnHost.style.display = 'none';
  }
}

function saveWord() {
  const { text, context } = currentSelection;
  if (!text) return;
  
  const wordObj = {
    id: Date.now(),
    word: text,
    context: context,
    url: window.location.href,
    createdAt: new Date().toISOString(),
    reviewStage: 0,
    nextReviewTime: new Date().toISOString()
  };

  const doSave = (words) => {
    const cleanText = text.replace(/[^a-zA-Z-]/g, '').toLowerCase();
    
    // Check if the clean word already exists
    if (!words.some(w => w.word.replace(/[^a-zA-Z-]/g, '').toLowerCase() === cleanText)) {
        words.push(wordObj);
        chrome.storage.local.set({ words }, () => {
            // Trigger background fetch
            chrome.runtime.sendMessage({ action: "fetch_meaning", wordId: wordObj.id, word: text });
            
            // Visual feedback
            if (floatingBtnHost) {
                const btn = floatingBtnHost.shadowRoot.querySelector('button');
                btn.innerHTML = `✅ <span style="margin-left:6px; font-size:12px; color:#6b7280; vertical-align:middle;">获取释义中...</span>`;
            }
        });
    } else {
        if (floatingBtnHost) {
            const btn = floatingBtnHost.shadowRoot.querySelector('button');
            const existing = words.find(w => w && w.word && w.word.replace(/[^a-zA-Z-]/g, '').toLowerCase() === cleanText);
            if (existing && existing.meaning) {
                btn.innerHTML = `已存在 <span style="margin-left:8px; font-weight:normal; color:#4b5563; font-size:13px; max-width:200px; display:inline-block; vertical-align:middle; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${existing.meaning}">${existing.meaning}</span>`;
            } else {
                btn.textContent = '已存在';
            }
        } else {
            hideButton();
        }
    }
  };

  chrome.storage.local.get({ words: [], isPaid: false }, (res) => {
    const words = res.words;
    const isPaid = !!res.isPaid;
    
    // 免费版限制：最多 20 个单词
    if (words.length >= 20 && !isPaid) {
        if (confirm("【免费版限制】您的生词本已达到上限 (20个)，是否立即解锁无限制添加？")) {
            chrome.runtime.sendMessage({ action: "open_payment" });
        }
        hideButton();
        // 在后台静默同步一次支付状态
        chrome.runtime.sendMessage({ action: "sync_payment" });
    } else {
        doSave(words);
    }
  });
}

// Handle right-click context menu "Add" action
chrome.runtime.onMessage.addListener((req) => {
  if (req.action === "capture") {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      if (!text) return;
      
      const wordCount = text.split(/\s+/).length;
      if (text.length >= 40 || wordCount > 3) {
          alert("添加失败：您选中的内容太长了。请只添加单词或短语（不超过3个词）。");
          return;
      }
      
      currentSelection = {
        text: text,
        context: selection.anchorNode?.parentNode?.textContent?.trim().substring(0, 200) || text
      };
      saveWord();
  }
});


chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.words && floatingBtnHost) {
        const newWords = changes.words.newValue || [];
        const btn = floatingBtnHost.shadowRoot.querySelector('button');
        if (!btn || floatingBtnHost.style.display === 'none') return;
        
        // Find the currently added word
        const currentWord = currentSelection.text.replace(/[^a-zA-Z-]/g, '').toLowerCase();
        const updatedWord = newWords.find(w => w && w.word && w.word.replace(/[^a-zA-Z-]/g, '').toLowerCase() === currentWord);
        
        if (updatedWord && updatedWord.meaning && btn.textContent.includes('✅')) {
            // Found meaning, update the button UI
            btn.innerHTML = `✅ <span style="margin-left:8px; font-weight:normal; color:#4b5563; font-size:13px; max-width:200px; display:inline-block; vertical-align:middle; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${updatedWord.meaning}">${updatedWord.meaning}</span>`;
        }
    }
});
