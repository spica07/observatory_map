/* 링크 복사 — 앱 공통.
 * 공유 시트를 쓸 수 있으면 그것을, 아니면 클립보드에 복사한다.
 * 버튼과 안내 말풍선은 여기서 만들어 붙이므로 index.html 은 건드리지 않는다.
 */
(function () {
  'use strict';

  var host = document.querySelector('.header-inner')
    || document.querySelector('.app-header')
    || document.querySelector('header')
    || document.body;

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'share-link-btn';
  btn.title = '링크 복사';
  btn.setAttribute('aria-label', '이 페이지 링크 복사');
  // \uC774\uBAA8\uC9C0 \uB300\uC2E0 \uC571\uC758 \uC544\uC774\uCF58 \uCCB4\uACC4(.ico, 24 viewBox, stroke)\uB97C \uADF8\uB300\uB85C \uB530\uB974\uB294 SVG\uB97C \uC4F4\uB2E4.
  // \uC774\uBAA8\uC9C0\uB294 \uAE30\uAE30\u00B7\uD3F0\uD2B8\uB9C8\uB2E4 \uBAA8\uC591\uC774 \uB2EC\uB77C\uC9C0\uACE0 \uB2E4\uB978 \uC544\uC774\uCF58\uB4E4\uACFC \uAD75\uAE30\uAC00 \uB9DE\uC9C0 \uC54A\uB294\uB2E4.
  btn.innerHTML =
    '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1"/>' +
    '<path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/></svg>';

  var toast = document.createElement('p');
  toast.className = 'share-link-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  toast.textContent = '링크가 복사됐어요!';

  host.appendChild(btn);
  host.appendChild(toast);

  var timer;
  function flash(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(function () { toast.hidden = true; }, 2000);
  }

  btn.addEventListener('click', function () {
    var url = location.href;
    if (navigator.share) {
      navigator.share({ title: document.title, url: url })['catch'](function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        flash('링크가 복사됐어요!');
      }, function () {
        window.prompt('아래 링크를 복사하세요', url);
      });
      return;
    }
    window.prompt('아래 링크를 복사하세요', url);
  });
})();
