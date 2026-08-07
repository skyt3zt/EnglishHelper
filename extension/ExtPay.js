function ExtPay(extensionId) {
  return {
    startBackground() {
      console.log(`ExtPay background started for ${extensionId}`);
    },
    async getUser() {
      return new Promise(resolve => {
          chrome.storage.local.get(['isPaidDemo'], (res) => {
              // Read from storage to simulate whether the user has paid
              resolve({ paid: !!res.isPaidDemo });
          });
      });
    },
    openPaymentPage() {
      if (confirm("【模拟收费墙 - ExtensionPay】\\n这原本会弹出一个真实的信用卡支付页面。\\n您正在尝试使用高级功能，愿意现在付费解锁吗？\\n\\n(点击“确定”模拟支付成功)")) {
          chrome.storage.local.set({isPaidDemo: true}, () => {
              alert("🎉 感谢购买！高级功能已为您永久解锁。");
          });
      } else {
          alert("您取消了支付，高级功能依然被锁定。");
      }
    }
  };
}

// For service workers and browsers
if (typeof window === 'undefined') {
  self.ExtPay = ExtPay;
} else {
  window.ExtPay = ExtPay;
}
