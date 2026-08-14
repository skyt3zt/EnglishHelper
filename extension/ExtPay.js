function ExtPay(extensionId) {
  const HOST = 'https://extensionpay.com';

  async function fetchUser() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['extpay_user'], async (res) => {
        let user = res.extpay_user;
        try {
          const url = user && user.id
            ? HOST + '/api/v1/users/user?extension_id=' + extensionId + '&user_id=' + user.id
            : HOST + '/api/v1/users/user?extension_id=' + extensionId;
          
          const resp = await fetch(url);
          if (resp.ok) {
            user = await resp.json();
            chrome.storage.local.set({ extpay_user: user });
            resolve(user);
            return;
          }
        } catch (err) {
          console.warn('ExtPay 网络验证失败，降级使用本地缓存数据:', err);
        }
        resolve(user || { paid: false });
      });
    });
  }

  return {
    startBackground() {
      chrome.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.url && changeInfo.url.indexOf('extensionpay.com/extension/' + extensionId) !== -1) {
          fetchUser();
        }
      });
    },
    async getUser() {
      return fetchUser();
    },
    openPaymentPage() {
      const url = HOST + '/extension/' + extensionId;
      chrome.tabs.create({ url: url });
    }
  };
}

if (typeof window === 'undefined') {
  self.ExtPay = ExtPay;
} else {
  window.ExtPay = ExtPay;
}
