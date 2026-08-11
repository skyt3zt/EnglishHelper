document.getElementById('btn-back').addEventListener('click', () => {
    window.location.href = 'dashboard.html';
});

const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const log = document.getElementById('log');
let selectedFile = null;

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        dropZone.textContent = `已选择: ${selectedFile.name}`;
    }
});

// A simple CSV parser that handles quoted fields
function parseCSV(text) {
    const lines = [];
    let currentLine = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < text.length && text[i+1] === '"') {
                    currentField += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentLine.push(currentField);
                currentField = '';
            } else if (char === '\n' || char === '\r') {
                if (char === '\r' && i + 1 < text.length && text[i+1] === '\n') {
                    i++;
                }
                currentLine.push(currentField);
                lines.push(currentLine);
                currentLine = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
    }
    if (currentField !== '' || currentLine.length > 0) {
        currentLine.push(currentField);
        lines.push(currentLine);
    }
    return lines;
}

document.getElementById('btn-import').addEventListener('click', () => {
    if (!selectedFile) {
        log.style.color = 'red';
        log.textContent = '请先选择文件！';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result.trim();
        // Remove BOM if present
        const text = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
        const rows = parseCSV(text);
        
        if (rows.length < 2) {
            log.style.color = 'red';
            log.textContent = '文件为空或格式错误！';
            return;
        }
        
        // rows[0] is header: Word,Context,Meaning,Phonetic,ReviewStage
        const wordsToAdd = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length < 5) continue;
            
            wordsToAdd.push({
                id: Date.now() + i, // Generate new IDs to avoid conflicts
                word: row[0],
                context: row[1],
                meaning: row[2],
                phonetic: row[3],
                reviewStage: parseInt(row[4]) || 0,
                url: '',
                createdAt: new Date().toISOString(),
                nextReviewTime: new Date().toISOString(),
                isPinned: false
            });
        }
        
        chrome.storage.local.get({ words: [] }, (res) => {
            const existingWords = res.words;
            let addedCount = 0;
            const newAddedWords = [];
            
            wordsToAdd.forEach(newWord => {
                const cleanWord = newWord.word.replace(/[^a-zA-Z\-]/g, '').toLowerCase();
                const exists = existingWords.some(w => w.word.replace(/[^a-zA-Z\-]/g, '').toLowerCase() === cleanWord);
                if (!exists) {
                    existingWords.push(newWord);
                    newAddedWords.push(newWord);
                    addedCount++;
                }
            });
            
            chrome.storage.local.set({ words: existingWords }, () => {
                log.style.color = '#059669';
                log.textContent = `导入成功！共扫描 ${wordsToAdd.length} 个单词，实际新增了 ${addedCount} 个单词 (跳过了已存在的单词)。`;
                
                // Re-fetch rich HTML meanings in background for newly added words
                newAddedWords.forEach(w => {
                    chrome.runtime.sendMessage({ action: "fetch_meaning", wordId: w.id, word: w.word });
                });
            });
        });
    };
    reader.readAsText(selectedFile);
});
