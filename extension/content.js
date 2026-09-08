let currentSelection = { text: '', context: '' };
let floatingBtnHost = null;
let lastActionWord = ''; // The word that was most recently saved or marked as existing
let isSaving = false; // Lock to prevent concurrent clicks / race conditions

// Show button when text is selected
document.addEventListener('mouseup', (e) => {
  // If the mouseup event occurred inside our floating button/host, ignore it completely
  if (floatingBtnHost && e.composedPath().includes(floatingBtnHost)) {
    return;
  }

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
document.addEventListener('mousedown', (e) => {
  // If clicking inside the floating button host, do NOT hide
  if (floatingBtnHost && e.composedPath().includes(floatingBtnHost)) {
    return;
  }
  hideButton();
});

function showButton(rect) {
  if (!floatingBtnHost) {
    floatingBtnHost = document.createElement('div');
    floatingBtnHost.id = 'wordcatcher-host';
    const shadow = floatingBtnHost.attachShadow({mode: 'open'});
    
    const btn = document.createElement('button');
    btn.textContent = '➕';
    // Use 'all: initial' to prevent host CSS bleed, and fixed positioning relative to viewport.
    btn.style.cssText = 'all: initial; position:fixed; z-index:2147483647; cursor:pointer; background:#fff; border:1px solid #ddd; border-radius:4px; padding:4px 8px; box-shadow:0 4px 6px rgba(0,0,0,0.1); font-size:14px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; transition: all 0.15s ease; user-select: none; max-width: 320px; white-space: nowrap;';
    
    btn.onmousedown = (e) => {
      e.preventDefault(); // Prevent text selection from clearing
      e.stopPropagation(); // Prevent document mousedown from hiding button
      saveWord();
    };
    
    btn.onmouseup = (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent document mouseup from re-triggering showButton
    };

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    
    shadow.appendChild(btn);
    document.body.appendChild(floatingBtnHost);
  }
  
  floatingBtnHost.style.display = 'block';
  const btn = floatingBtnHost.shadowRoot.querySelector('button');
  
  // Positioning with viewport edge protection
  let top = rect.bottom + 5;
  let left = rect.left + (rect.width / 2);
  if (left + 220 > window.innerWidth) {
    left = Math.max(10, window.innerWidth - 240);
  }
  if (top + 40 > window.innerHeight && rect.top > 40) {
    top = rect.top - 35;
  }
  btn.style.top = `${top}px`;
  btn.style.left = `${left}px`;

  // If in the middle of saving, preserve loading state
  if (isSaving) return;

  const currentClean = currentSelection.text.replace(/[^a-zA-Z\s-]/g, '').trim().toLowerCase();

  // If this exact word was already saved or found to exist, keep the state
  if (lastActionWord === currentClean && (btn.textContent.includes('✅') || btn.textContent.includes('已存在'))) {
    return;
  }

  // Reset icon for new selection
  btn.textContent = '➕';
  btn.style.cursor = 'pointer';
}

function hideButton() {
  if (floatingBtnHost) {
    floatingBtnHost.style.display = 'none';
  }
}

function saveWord() {
  if (isSaving) return;

  // Check extension context validity (e.g. extension was reloaded in chrome://extensions)
  if (!chrome.runtime?.id) {
    alert('【WordCatcher】插件已重新加载或更新，请刷新当前网页后再使用。');
    return;
  }

  let { text, context } = currentSelection;
  if (!text) {
    const fallbackText = window.getSelection()?.toString().trim();
    if (fallbackText) {
      text = fallbackText;
      context = window.getSelection().anchorNode?.parentNode?.textContent?.trim().substring(0, 200) || fallbackText;
      currentSelection = { text, context };
    } else {
      hideButton();
      return;
    }
  }

  const cleanText = text.replace(/[^a-zA-Z\s-]/g, '').trim().toLowerCase();
  if (!cleanText) {
    if (floatingBtnHost) {
      const btn = floatingBtnHost.shadowRoot.querySelector('button');
      if (btn) {
        btn.innerHTML = `⚠️ <span style="margin-left:4px; font-size:12px; color:#ef4444;">仅支持英文</span>`;
        setTimeout(() => {
          if (btn) btn.textContent = '➕';
        }, 1500);
      }
    }
    return;
  }

  isSaving = true;

  // Immediate visual feedback so user knows the click registered
  if (floatingBtnHost) {
    const btn = floatingBtnHost.shadowRoot.querySelector('button');
    if (btn) {
      btn.innerHTML = `⏳ <span style="margin-left:4px; font-size:12px; color:#6b7280; vertical-align:middle;">添加中...</span>`;
    }
  }

  const resetButton = (msg) => {
    isSaving = false;
    if (floatingBtnHost) {
      const btn = floatingBtnHost.shadowRoot.querySelector('button');
      if (btn) {
        if (msg) {
          btn.innerHTML = msg;
          setTimeout(() => {
            if (btn && btn.textContent.includes('失败')) btn.textContent = '➕';
          }, 2000);
        } else {
          btn.textContent = '➕';
        }
      }
    }
  };

  const wordObj = {
    id: Date.now(),
    word: text,
    context: context,
    url: window.location.href,
    createdAt: new Date().toISOString(),
    reviewStage: 0,
    nextReviewTime: new Date().toISOString()
  };

  const normalizeWord = (w) => (w && typeof w.word === 'string') ? w.word.replace(/[^a-zA-Z\s-]/g, '').trim().toLowerCase() : '';

  const doSave = (words) => {
    const existing = words.find(w => normalizeWord(w) === cleanText);
    
    if (!existing) {
      words.push(wordObj);
      chrome.storage.local.set({ words }, () => {
        isSaving = false;
        lastActionWord = cleanText;

        if (chrome.runtime.lastError) {
          console.error('[WordCatcher] storage.set error:', chrome.runtime.lastError);
          resetButton(`❌ <span style="margin-left:4px; font-size:12px; color:#ef4444;">保存失败</span>`);
          return;
        }

        // Trigger background fetch
        try {
          chrome.runtime.sendMessage({ action: "fetch_meaning", wordId: wordObj.id, word: text });
        } catch (e) {
          console.warn('[WordCatcher] fetch_meaning send error:', e);
        }
        
        // Visual feedback
        if (floatingBtnHost) {
          const btn = floatingBtnHost.shadowRoot.querySelector('button');
          if (btn) {
            btn.innerHTML = `✅ <span style="margin-left:6px; font-size:12px; color:#6b7280; vertical-align:middle;">获取释义中...</span>`;
          }
        }
      });
    } else {
      isSaving = false;
      lastActionWord = cleanText;
      if (floatingBtnHost) {
        const btn = floatingBtnHost.shadowRoot.querySelector('button');
        if (btn) {
          if (existing.meaning) {
            btn.innerHTML = `已存在 <span style="margin-left:8px; font-weight:normal; color:#4b5563; font-size:13px; max-width:200px; display:inline-block; vertical-align:middle; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${existing.meaning}">${existing.meaning}</span>`;
          } else {
            btn.textContent = '已存在';
          }
        }
      }
    }
  };

  try {
    chrome.storage.local.get({ words: [], isPaid: false }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('[WordCatcher] storage.get error:', chrome.runtime.lastError);
        resetButton();
        return;
      }

      const words = Array.isArray(res.words) ? res.words : [];
      const isPaid = !!res.isPaid;
      
      // 免费版限制：最多 20 个单词
      if (words.length >= 20 && !isPaid) {
        let responded = false;
        const timer = setTimeout(() => {
          if (!responded) {
            responded = true;
            console.warn('[WordCatcher] sync_payment timed out, checking cached status');
            isSaving = false;
            resetButton();
            if (confirm("【免费版限制】您的生词本已达到上限 (20个)。\n若您已是白名单/付费用户，点击“确定”将为您打开登录激活页面。")) {
              try { chrome.runtime.sendMessage({ action: "open_login" }); } catch (e) {}
            }
            hideButton();
          }
        }, 2000);

        try {
          chrome.runtime.sendMessage({ action: "sync_payment" }, (syncRes) => {
            if (responded) return;
            responded = true;
            clearTimeout(timer);
            if (syncRes && syncRes.paid) {
              doSave(words);
            } else {
              isSaving = false;
              resetButton();
              if (confirm("【免费版限制】您的生词本已达到上限 (20个)。\n若您已是白名单/付费用户，点击“确定”将为您打开登录激活页面。")) {
                try { chrome.runtime.sendMessage({ action: "open_login" }); } catch (e) {}
              }
              hideButton();
            }
          });
        } catch (e) {
          if (!responded) {
            responded = true;
            clearTimeout(timer);
            isSaving = false;
            resetButton();
          }
        }
      } else {
        doSave(words);
      }
    });
  } catch (err) {
    console.error('[WordCatcher] saveWord exception:', err);
    resetButton();
    if (err.message && err.message.includes('Extension context invalidated')) {
      alert('【WordCatcher】插件已重新加载或更新，请刷新当前网页后再使用。');
    }
  }
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
    const currentWord = currentSelection.text.replace(/[^a-zA-Z\s-]/g, '').trim().toLowerCase();
    const normalizeWord = (w) => (w && typeof w.word === 'string') ? w.word.replace(/[^a-zA-Z\s-]/g, '').trim().toLowerCase() : '';
    const updatedWord = newWords.find(w => normalizeWord(w) === currentWord);
    
    if (updatedWord && updatedWord.meaning && (btn.textContent.includes('✅') || btn.textContent.includes('获取释义'))) {
      // Found meaning, update the button UI
      btn.innerHTML = `✅ <span style="margin-left:8px; font-weight:normal; color:#4b5563; font-size:13px; max-width:200px; display:inline-block; vertical-align:middle; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${updatedWord.meaning}">${updatedWord.meaning}</span>`;
    }
  }
});
