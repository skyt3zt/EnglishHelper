const app = document.getElementById('app');
let allWords = [];
let queue = [];
let currentWord = null;
let isFlipped = false;

let currentView = 'review';

document.getElementById('nav-review').addEventListener('click', () => switchView('review'));
document.getElementById('nav-library').addEventListener('click', () => switchView('library'));

function switchView(view) {
    currentView = view;
    document.getElementById('nav-review').classList.toggle('active', view === 'review');
    document.getElementById('nav-library').classList.toggle('active', view === 'library');
    if (view === 'review') init();
    else renderLibrary();
}

function init() {
    chrome.storage.local.get({ words: [] }, (res) => {
        allWords = res.words;
        const now = new Date().toISOString();
        queue = allWords.filter(w => w.reviewStage !== -1 && w.nextReviewTime <= now);
        
        queue.sort(() => Math.random() - 0.5);
        nextCard();
    });
}

function renderLibrary() {
    chrome.storage.local.get({ words: [] }, (res) => {
        const words = res.words.reverse();
        
        const renderRows = (list) => list.map(w => `
            <tr style="${w.reviewStage === -1 ? 'background: #f8fafc;' : (w.isPinned ? 'background: #fffbeb;' : '')}">
                <td style="font-weight:600; color:${w.reviewStage === -1 ? '#64748b' : '#111827'};">
                    ${w.isPinned ? '📌 ' : ''}${w.word}
                    <span class="btn-speak" data-word="${w.word.replace(/"/g, '&quot;')}" style="cursor: pointer; font-size: 14px; margin-left: 4px;" title="播放发音">🔊</span>
                </td>
                <td>
                    ${w.meaning && !w.meaning.includes('未找到') && !w.meaning.includes('失败') && !w.meaning.includes('无效') && /[一-龥]/.test(w.meaning) ? `
                        <div style="font-size:14px; font-weight:500;">${w.meaning}</div>
                        <div style="font-size:12px; color:#6b7280; font-family:monospace;">${w.phonetic || ''}</div>
                    ` : `
                        <div style="font-size:12px; color:#ef4444; margin-bottom:4px;">${w.meaning || '暂无'}</div>
                        <button class="btn-fetch" data-id="${w.id}" style="padding:4px 8px; font-size:12px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; cursor:pointer;">重新获取</button>
                    `}
                </td>
                <td style="font-style:italic; font-size:12px; color:#6b7280;">${w.context}</td>
                <td style="color:#4b5563;">${w.reviewStage === -1 ? '已掌握' : '阶段 ' + w.reviewStage}</td>
                <td>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                        <button class="btn-pin" data-id="${w.id}" style="padding:4px 8px; font-size:12px; background:#fef3c7; color:#d97706; border:none; cursor:pointer;" title="${w.isPinned ? '取消置顶' : '置顶 (最多3个)'}">${w.isPinned ? '取消📌' : '📌'}</button>
                        ${w.reviewStage !== -1 ? `
                        <button class="btn-up" data-id="${w.id}" style="padding:4px 8px; font-size:12px; background:#f3f4f6; color:#4b5563; border:none; cursor:pointer;" title="上移">🔼</button>
                        <button class="btn-down" data-id="${w.id}" style="padding:4px 8px; font-size:12px; background:#f3f4f6; color:#4b5563; border:none; cursor:pointer;" title="下移">🔽</button>
                        ` : ''}
                        <button class="btn-master" data-id="${w.id}" style="padding:4px 8px; font-size:12px; background:#d1fae5; color:#047857; border:none; cursor:pointer;">${w.reviewStage === -1 ? '取消' : '掌握'}</button>
                        <button class="btn-del" data-id="${w.id}" style="padding:4px 8px; font-size:12px; background:#fee2e2; color:#b91c1c; border:none; cursor:pointer;">删除</button>
                    </div>
                </td>
            </tr>
        `).join('');

        const learning = words.filter(w => w.reviewStage !== -1);
        const mastered = words.filter(w => w.reviewStage === -1);
        
        const tableHeader = `
            <thead>
                <tr>
                    <th style="width: 15%">单词</th>
                    <th style="width: 20%">释义</th>
                    <th style="width: 35%">上下文</th>
                    <th style="width: 10%">状态</th>
                    <th style="width: 20%">操作</th>
                </tr>
            </thead>
        `;

        app.innerHTML = `
            <div id="lib-container">
                <h3 style="margin-top:0; margin-bottom:12px; color:#334155; font-size:16px;">正在学习 (${learning.length})</h3>
                <table class="library-table" style="margin-bottom: 30px;">
                    ${tableHeader}
                    <tbody>
                        ${renderRows(learning) || '<tr><td colspan="5" style="text-align:center; padding: 30px; color:#94a3b8;">暂无生词</td></tr>'}
                    </tbody>
                </table>

                <h3 style="margin-top:0; margin-bottom:12px; color:#334155; font-size:16px;">已掌握 (${mastered.length})</h3>
                <table class="library-table" style="opacity: 0.8;">
                    ${tableHeader}
                    <tbody>
                        ${renderRows(mastered) || '<tr><td colspan="5" style="text-align:center; padding: 30px; color:#94a3b8;">暂无已掌握单词</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('lib-container')?.addEventListener('click', async (e) => {
            if (e.target.classList.contains('btn-speak')) {
                e.stopPropagation();
                const msg = new SpeechSynthesisUtterance(e.target.dataset.word);
                msg.lang = 'en-US';
                window.speechSynthesis.speak(msg);
                return;
            }

            const btn = e.target.closest('button');
            if (!btn) return;
            
            const id = parseInt(btn.dataset.id);
            const wordObj = words.find(w => w.id === id);
            if (!wordObj) return;

            const enforceOrder = (list) => {
                const pinned = list.filter(w => w.isPinned);
                const unpinned = list.filter(w => !w.isPinned);
                return [...pinned, ...unpinned];
            };

            if (btn.classList.contains('btn-del')) {
                if (!confirm('确定要删除这个单词吗？此操作不可恢复。')) return;
                const newWords = words.filter(w => w.id !== id);
                chrome.storage.local.set({ words: enforceOrder(newWords).reverse() }, renderLibrary);
            } 
            else if (btn.classList.contains('btn-master')) {
                wordObj.reviewStage = wordObj.reviewStage === -1 ? 0 : -1;
                chrome.storage.local.set({ words: enforceOrder(words).reverse() }, renderLibrary);
            }
            else if (btn.classList.contains('btn-pin')) {
                if (!wordObj.isPinned && words.filter(w => w.isPinned).length >= 3) {
                    alert('最多只能置顶3个单词！');
                    return;
                }
                wordObj.isPinned = !wordObj.isPinned;
                chrome.storage.local.set({ words: enforceOrder(words).reverse() }, renderLibrary);
            }
            else if (btn.classList.contains('btn-up')) {
                const idx = words.findIndex(w => w.id === id);
                let prevIdx = -1;
                for (let i = idx - 1; i >= 0; i--) {
                    if (words[i].reviewStage !== -1 && words[i].isPinned === wordObj.isPinned) { 
                        prevIdx = i; 
                        break; 
                    }
                }
                if (prevIdx !== -1) {
                    [words[idx], words[prevIdx]] = [words[prevIdx], words[idx]];
                    chrome.storage.local.set({ words: enforceOrder(words).reverse() }, renderLibrary);
                }
            }
            else if (btn.classList.contains('btn-down')) {
                const idx = words.findIndex(w => w.id === id);
                let nextIdx = -1;
                for (let i = idx + 1; i < words.length; i++) {
                    if (words[i].reviewStage !== -1 && words[i].isPinned === wordObj.isPinned) { 
                        nextIdx = i; 
                        break; 
                    }
                }
                if (nextIdx !== -1) {
                    [words[idx], words[nextIdx]] = [words[nextIdx], words[idx]];
                    chrome.storage.local.set({ words: enforceOrder(words).reverse() }, renderLibrary);
                }
            }
            else if (btn.classList.contains('btn-fetch')) {
                btn.textContent = '获取中...';
                const cleanWord = wordObj.word.replace(/[^a-zA-Z\\-]/g, '');
                if (!cleanWord) {
                    btn.textContent = '无效';
                    return;
                }
                
                chrome.storage.local.get({ targetLang: 'zh-CN' }, async (storageRes) => {
                    const fetchWithTimeout = (url, ms) => Promise.race([
                        fetch(url),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
                    ]);

                    const pPhonetic = fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanWord}`, 3000)
                        .then(r => r.ok ? r.json() : null)
                        .then(data => {
                            let phonetic = '';
                            let pos = '';
                            if (data && Array.isArray(data) && data[0]) {
                                phonetic = data[0].phonetics?.find(p => p.text)?.text || '';
                                if (data[0].meanings) {
                                    const posMap = { noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', pronoun: 'pron.', preposition: 'prep.', conjunction: 'conj.', interjection: 'int.' };
                                    const posSet = new Set(data[0].meanings.map(m => posMap[m.partOfSpeech] || m.partOfSpeech));
                                    pos = Array.from(posSet).join(', ');
                                }
                            }
                            return { phonetic, pos };
                        })
                        .catch(() => ({ phonetic: '', pos: '' }));

                    const fetchMyMemory = () => fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${cleanWord}&langpair=en|${storageRes.targetLang}`, 5000)
                        .then(r => r.ok ? r.json() : null)
                        .then(data => data && data.responseData && data.responseData.translatedText ? data.responseData.translatedText : '网络问题未找到释义，请检查网络后重新获取')
                        .catch(() => '网络问题未找到释义，请检查网络后重新获取');

                    const pMeaning = fetchWithTimeout(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${storageRes.targetLang}&dt=t&q=${cleanWord}`, 2500)
                        .then(res => {
                            if (!res.ok) throw new Error('Google Failed');
                            return res.json();
                        })
                        .then(data => {
                            if (data && data[0] && data[0][0] && data[0][0][0]) return data[0][0][0];
                            throw new Error('Invalid Google Response');
                        })
                        .catch(() => fetchMyMemory());

                    const [phoneticData, meaning] = await Promise.all([pPhonetic, pMeaning]);
                    const finalMeaning = phoneticData.pos ? `[${phoneticData.pos}] ${meaning}` : meaning;
                    wordObj.phonetic = phoneticData.phonetic;
                    wordObj.meaning = finalMeaning;
                    
                    chrome.storage.local.set({ words: enforceOrder(words).reverse() }, renderLibrary);
                });
            }
        });
    });
}

function nextCard() {
    if (queue.length === 0) {
        renderDone();
        return;
    }
    
    currentWord = queue[0];
    isFlipped = false;
    
    // Highlight word in context safely
    const escapedWord = currentWord.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedWord})`, 'gi');
    const highlightedContext = currentWord.context.replace(regex, '<span class="highlight">$1</span>');
    
    app.innerHTML = `
        <div class="card" id="card">
            <div class="front">
                <div class="word">
                    ${currentWord.word}
                    <span id="btn-speak-front" style="cursor: pointer; font-size: 0.7em; margin-left: 8px;" title="播放发音">🔊</span>
                </div>
                <div class="context">${highlightedContext}</div>
                <div class="hint">点击卡片或按空格键翻转</div>
            </div>
            <div class="back">
                <div class="loading" id="loading">获取释义中...</div>
                <div id="dict-result" class="hidden">
                    <div class="phonetic">
                        <span id="phonetic"></span>
                        <span id="btn-speak-back" style="cursor: pointer; font-size: 0.7em; margin-left: 8px;" title="播放发音">🔊</span>
                    </div>
                    <div class="meaning" id="meaning"></div>
                </div>
                <div class="controls hidden" id="controls">
                    <button class="btn-forgot" data-days="1">忘记 (1天)</button>
                    <button class="btn-hard" data-days="3">模糊 (3天)</button>
                    <button class="btn-good" data-days="7">熟练 (7天)</button>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('card').addEventListener('click', flipCard);
    
    const speakWord = (e) => {
        e.stopPropagation();
        const msg = new SpeechSynthesisUtterance(currentWord.word);
        msg.lang = 'en-US';
        window.speechSynthesis.speak(msg);
    };
    
    document.getElementById('btn-speak-front')?.addEventListener('click', speakWord);
    document.getElementById('btn-speak-back')?.addEventListener('click', speakWord);
}

function flipCard() {
    if (isFlipped) return;
    isFlipped = true;
    
    const card = document.getElementById('card');
    card.classList.add('show-back');
    card.removeEventListener('click', flipCard);
    
    if (currentWord.meaning) {
        showDict(currentWord.phonetic, currentWord.meaning);
    } else {
        const cleanWord = currentWord.word.replace(/[^a-zA-Z\-]/g, '');
        if (!cleanWord) {
            showDict('', '无效单词');
            return;
        }
        
        // Fetch Phonetic & Meaning with targetLang
        chrome.storage.local.get({ targetLang: 'zh-CN' }, (res) => {
            const fetchWithTimeout = (url, ms) => Promise.race([
                fetch(url),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
            ]);

            const pPhonetic = fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanWord}`, 3000)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    let phonetic = '';
                    let pos = '';
                    if (data && Array.isArray(data) && data[0]) {
                        phonetic = data[0].phonetics?.find(p => p.text)?.text || '';
                        if (data[0].meanings) {
                            const posMap = { noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', pronoun: 'pron.', preposition: 'prep.', conjunction: 'conj.', interjection: 'int.' };
                            const posSet = new Set(data[0].meanings.map(m => posMap[m.partOfSpeech] || m.partOfSpeech));
                            pos = Array.from(posSet).join(', ');
                        }
                    }
                    return { phonetic, pos };
                })
                .catch(() => ({ phonetic: '', pos: '' }));

            const fetchMyMemory = () => fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${cleanWord}&langpair=en|${res.targetLang}`, 5000)
                .then(r => r.ok ? r.json() : null)
                .then(data => data && data.responseData && data.responseData.translatedText ? data.responseData.translatedText : '网络问题未找到释义，请检查网络后重新获取')
                .catch(() => '网络问题未找到释义，请检查网络后重新获取');

            const pMeaning = fetchWithTimeout(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${res.targetLang}&dt=t&q=${cleanWord}`, 2500)
                .then(r => {
                    if (!r.ok) throw new Error('Google Failed');
                    return r.json();
                })
                .then(data => {
                    if (data && data[0] && data[0][0] && data[0][0][0]) return data[0][0][0];
                    throw new Error('Invalid Google Response');
                })
                .catch(() => fetchMyMemory());

            Promise.all([pPhonetic, pMeaning]).then(([phoneticData, meaning]) => {
                const finalMeaning = phoneticData.pos ? `[${phoneticData.pos}] ${meaning}` : meaning;
                currentWord.phonetic = phoneticData.phonetic;
                currentWord.meaning = finalMeaning;
                saveCurrentWord();
                showDict(phoneticData.phonetic, finalMeaning);
            });
        });
    }
}

function showDict(phonetic, meaning) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('dict-result').classList.remove('hidden');
    document.getElementById('controls').classList.remove('hidden');
    
    document.getElementById('phonetic').textContent = phonetic;
    document.getElementById('meaning').textContent = meaning;
    
    document.querySelectorAll('.controls button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent card click
            handleReview(parseInt(e.target.dataset.days));
        });
    });
}

function handleReview(daysToAdd) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    currentWord.nextReviewTime = nextDate.toISOString();
    
    if (daysToAdd === 7) currentWord.reviewStage++;
    else if (daysToAdd === 1) currentWord.reviewStage = 0;
    
    saveCurrentWord(() => {
        queue.shift();
        nextCard();
    });
}

function saveCurrentWord(callback) {
    const index = allWords.findIndex(w => w.id === currentWord.id);
    if(index !== -1) {
        allWords[index] = currentWord;
        chrome.storage.local.set({ words: allWords }, callback);
    }
}

function renderDone() {
    app.innerHTML = `
        <div class="done">
            <h1>🎉</h1>
            <h2>今日复习完成！</h2>
            <p>干得漂亮，去捕捉更多生词吧。</p>
            <div style="display: flex; gap: 16px; justify-content: center; margin-top: 30px;">
                <button id="btn-review-again" style="background: #10b981; color: white; width: 160px; padding: 12px; border-radius: 8px; border: none; cursor: pointer;">重新复习(全部)</button>
                <button id="btn-close-page" style="background: #3b82f6; color: white; width: 160px; padding: 12px; border-radius: 8px; border: none; cursor: pointer;">关闭页面</button>
            </div>
        </div>
    `;
    
    document.getElementById('btn-close-page')?.addEventListener('click', () => {
        window.close();
    });

    const extpay = ExtPay('wordcatcher');
    
    document.getElementById('btn-review-again')?.addEventListener('click', () => {
        chrome.storage.local.get({ words: [] }, (res) => {
            allWords = res.words;
            // Ponytail: Force review all non-mastered words, ignoring time constraint
            queue = allWords.filter(w => w.reviewStage !== -1);
            if (queue.length === 0) {
                alert("您太棒了，词库里所有单词都已掌握，快去捕捉新词吧！");
                return;
            }
            queue.sort(() => Math.random() - 0.5);
            nextCard();
        });
    });
}

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && currentView === 'review') {
        e.preventDefault(); // prevent page scroll
        if (!isFlipped && queue.length > 0) {
            flipCard();
        }
    }
});

init();
