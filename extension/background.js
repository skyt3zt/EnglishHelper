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
        // Combine pos and meaning
        const finalMeaning = phoneticData.pos ? `[${phoneticData.pos}] ${meaning}` : meaning;
        
        // Must fetch words array again in case it changed during the API calls
        chrome.storage.local.get({ words: [] }, (freshRes) => {
            const index = freshRes.words.findIndex(w => w.id === req.wordId);
            if (index !== -1) {
                freshRes.words[index].phonetic = phoneticData.phonetic;
                freshRes.words[index].meaning = finalMeaning;
                chrome.storage.local.set({ words: freshRes.words });
            }
        });
      });
    });
  }
});
