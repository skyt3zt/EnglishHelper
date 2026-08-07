importScripts('ExtPay.js');
const extpay = ExtPay('wordcatcher');
extpay.startBackground();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-word",
    title: "添加到生词本",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "add-word") {
    // Send message to content script to handle saving so we capture the sentence context.
    chrome.tabs.sendMessage(tab.id, { action: "capture" });
  }
});

// Listen for meaning fetch requests from content script
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "check_payment") {
    extpay.getUser().then(user => {
        sendResponse({ paid: user.paid });
    });
    return true; // Keep the message channel open for the async response
  }

  if (req.action === "open_payment") {
    extpay.openPaymentPage();
    return;
  }

  if (req.action === "fetch_meaning") {
    const { wordId, word } = req;
    const cleanWord = word.replace(/[^a-zA-Z\\-]/g, '');
    if (!cleanWord) return;

    chrome.storage.local.get({ words: [], targetLang: 'zh-CN' }, (res) => {
      const fetchWithTimeout = (url, ms) => Promise.race([
        fetch(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
      ]);

      if (res.targetLang === 'zh-CN') {
          fetchWithTimeout(`https://dict.youdao.com/jsonapi?q=${cleanWord}`, 5000)
            .then(r => r.json())
            .then(data => {
                let phonetic = '';
                let meaning = '';
                let dictHtml = '';

                if (data.ec || data.simple) {
                    const usphone = data.simple?.word?.[0]?.usphone || data.ec?.word?.[0]?.usphone;
                    const ukphone = data.simple?.word?.[0]?.ukphone || data.ec?.word?.[0]?.ukphone;
                    if (ukphone) phonetic += `英 /${ukphone}/ `;
                    if (usphone) phonetic += `美 /${usphone}/`;

                    if (data.ec?.word?.[0]?.trs) {
                        meaning = data.ec.word[0].trs[0].tr[0].l.i[0].substring(0, 50);
                    }

                    // Build rich HTML like Manggo Dictionary
                    dictHtml += `<div style="font-size:14px; color:#a1a1aa; margin-bottom:8px;">${phonetic}</div>`;
                    
                    if (data.ec?.exam_type) {
                        dictHtml += `<div style="font-size:12px; color:#ea580c; margin-bottom:12px;">标签: ${data.ec.exam_type.join(' · ').toLowerCase()}</div>`;
                    }
                    
                    if (data.expand_ec?.word?.[0]?.transList) {
                        dictHtml += `<div style="font-weight:600; font-size:14px; margin-bottom:4px; color:#e4e4e7;">释义</div>`;
                        dictHtml += `<div style="font-size:14px; color:#d4d4d8; margin-bottom:12px; line-height:1.5;">`;
                        data.expand_ec.word[0].transList.forEach(t => {
                            if (t.content?.detailPos) {
                                dictHtml += `<div><span style="color:#60a5fa; font-style:italic; margin-right:4px;">${t.content.detailPos}</span>${t.trans}</div>`;
                            } else {
                                dictHtml += `<div>${t.trans}</div>`;
                            }
                        });
                        dictHtml += `</div>`;
                    } else if (data.ec?.word?.[0]?.trs) {
                        dictHtml += `<div style="font-weight:600; font-size:14px; margin-bottom:4px; color:#e4e4e7;">释义</div>`;
                        dictHtml += `<div style="font-size:14px; color:#d4d4d8; margin-bottom:12px; line-height:1.5;">`;
                        data.ec.word[0].trs.forEach(tr => {
                            dictHtml += `<div>${tr.tr[0].l.i[0]}</div>`;
                        });
                        dictHtml += `</div>`;
                    }
                    
                    if (data.collins?.collins_entries?.[0]?.entries?.entry) {
                        dictHtml += `<div style="font-weight:600; font-size:14px; margin-bottom:4px; color:#e4e4e7;">词典释义</div>`;
                        dictHtml += `<div style="font-size:14px; color:#d4d4d8; margin-bottom:12px; line-height:1.5;">`;
                        const entries = data.collins.collins_entries[0].entries.entry;
                        entries.slice(0, 5).forEach(e => {
                            const def = e.tran_entry?.[0]?.pos_entry?.tran?.[0]?.tran_en;
                            if (def) {
                                const pos = e.tran_entry?.[0]?.pos_entry?.pos;
                                dictHtml += `<div style="margin-bottom:4px;">${pos ? `<span style="color:#60a5fa; font-style:italic; margin-right:4px;">v.</span>` : ''}${def.replace(/<[^>]+>/g, '')}</div>`;
                            }
                        });
                        dictHtml += `</div>`;
                    }
                    
                    if (data.expand_ec?.word?.[0]?.wfs || data.ec?.word?.[0]?.wfs) {
                        const wfs = data.expand_ec?.word?.[0]?.wfs || data.ec?.word?.[0]?.wfs;
                        dictHtml += `<div style="font-weight:600; font-size:14px; margin-bottom:4px; color:#e4e4e7;">词形变化</div>`;
                        dictHtml += `<div style="font-size:14px; color:#d4d4d8; margin-bottom:12px; line-height:1.5;">`;
                        wfs.forEach(wf => {
                            const name = wf.wf?.name || wf.name;
                            const value = wf.wf?.value || wf.value;
                            dictHtml += `<div>${name}: ${value}</div>`;
                        });
                        dictHtml += `</div>`;
                    }
                }

                chrome.storage.local.get({ words: [] }, (freshRes) => {
                    const index = freshRes.words.findIndex(w => w.id === req.wordId);
                    if (index !== -1) {
                        freshRes.words[index].phonetic = phonetic;
                        freshRes.words[index].meaning = meaning || phonetic;
                        freshRes.words[index].dictHtml = dictHtml;
                        chrome.storage.local.set({ words: freshRes.words });
                    }
                });
            }).catch(console.error);
      } else {
          // Fallback to basic API for non-Chinese
          const pPhonetic = fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanWord}`, 3000)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                let phonetic = '';
                let pos = '';
                if (data && Array.isArray(data) && data[0]) {
                    phonetic = data[0].phonetics.find(p => p.text)?.text || '';
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
            .then(data => data && data.responseData && data.responseData.translatedText ? data.responseData.translatedText : '网络问题未找到释义')
            .catch(() => '网络问题未找到释义');

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
            chrome.storage.local.get({ words: [] }, (freshRes) => {
                const index = freshRes.words.findIndex(w => w.id === req.wordId);
                if (index !== -1) {
                    freshRes.words[index].phonetic = phoneticData.phonetic;
                    freshRes.words[index].meaning = finalMeaning;
                    chrome.storage.local.set({ words: freshRes.words });
                }
            });
          });
      }
    });
  }
});
