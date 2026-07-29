/* 천문대 지도 — 데이터 현황 리포트 */
(function () {
  'use strict';

  var PLACES = window.PLACES || [];
  var DATA_META = window.DATA_META || {};

  var KIND_ORDER = ['천문대', '과학관', '관측명소'];
  var KIND_COLOR = { '천문대': '#7B9CFF', '과학관': '#5FD3C0', '관측명소': '#F0B24A' };
  var KID_LABEL = { 1: '유아도 편해요', 2: '보호자 주의', 3: '유아 비권장' };
  var DARK_LABEL = { 1: '은하수 보여요', 2: '별 잘 보여요', 3: '도심 밝아요' };
  var REGION_ORDER = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  var REGION_COLOR = {
    '서울': '#E1466A', '부산': '#4680E1', '대구': '#E18C46', '인천': '#46B1E1',
    '광주': '#9B59D9', '대전': '#46C78F', '울산': '#5A6ACF', '세종': '#C7A446',
    '경기': '#46A0D9', '강원': '#2FA88C', '충북': '#D9679C', '충남': '#B08968',
    '전북': '#8CB446', '전남': '#469FB0', '경북': '#C96F4A', '경남': '#7C6FD9',
    '제주': '#E19846'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function pct(n, total) { return total ? Math.round((n / total) * 100) : 0; }

  var total = PLACES.length;

  /* ---------- 한눈에 보기 ---------- */
  function statTiles() {
    var free = PLACES.filter(function (p) { return p.isFree === true; }).length;
    var kidOk = PLACES.filter(function (p) { return p.kidLevel === 1; }).length;
    var milky = PLACES.filter(function (p) { return p.darkLevel === 1; }).length;
    var planet = PLACES.filter(function (p) { return p.planetarium === true; }).length;
    var tiles = [
      { num: total, label: '전체' },
      { num: kidOk, label: '유아도 편한 곳' },
      { num: milky, label: '은하수 볼 수 있는 곳' },
      { num: free, label: '무료' },
      { num: planet, label: '천체투영실 있음' }
    ];
    document.getElementById('statTiles').innerHTML = tiles.map(function (t) {
      return '<div class="stat-tile"><div class="num">' + t.num + '</div>' +
        '<div class="label">' + esc(t.label) + '</div></div>';
    }).join('');
  }

  /* ---------- 분포 칩 ---------- */
  function chips(elId, entries) {
    document.getElementById(elId).innerHTML = entries.map(function (e) {
      return '<div class="status-chip">' +
        '<span class="tag" style="background:' + e.color + ';color:#12193a">' + esc(e.label) + '</span>' +
        '<span class="chip-num">' + e.count + '곳 (' + pct(e.count, total) + '%)</span>' +
        '</div>';
    }).join('');
  }

  function kindChips() {
    chips('kindChips', KIND_ORDER.map(function (k) {
      return {
        label: k, color: KIND_COLOR[k],
        count: PLACES.filter(function (p) { return p.kind === k; }).length
      };
    }));
  }

  function levelChips(elId, field, labels, colors) {
    chips(elId, [1, 2, 3].map(function (lv) {
      return {
        label: labels[lv], color: colors[lv],
        count: PLACES.filter(function (p) { return p[field] === lv; }).length
      };
    }));
  }

  /* ---------- 지역별 표 ---------- */
  function regionTable() {
    var rows = ['<thead><tr><th>지역</th>' +
      KIND_ORDER.map(function (k) { return '<th>' + k + '</th>'; }).join('') +
      '<th>합계</th><th>유아도 편함</th><th>은하수 가능</th></tr></thead><tbody>'];
    REGION_ORDER.forEach(function (r) {
      var sub = PLACES.filter(function (p) { return p.region === r; });
      if (!sub.length) return;
      rows.push('<tr>' +
        '<td><span class="legend-dot" style="background:' + (REGION_COLOR[r] || '#7B9CFF') + '"></span>' +
        '<a href="index.html?region=' + encodeURIComponent(r) + '">' + esc(r) + '</a></td>' +
        KIND_ORDER.map(function (k) {
          return '<td>' + sub.filter(function (p) { return p.kind === k; }).length + '</td>';
        }).join('') +
        '<td><strong>' + sub.length + '</strong></td>' +
        '<td>' + sub.filter(function (p) { return p.kidLevel === 1; }).length + '</td>' +
        '<td>' + sub.filter(function (p) { return p.darkLevel === 1; }).length + '</td>' +
        '</tr>');
    });
    rows.push('</tbody>');
    document.getElementById('regionTable').innerHTML = rows.join('');
  }

  /* ---------- 미확인 정보 비율 ---------- */
  function unknownTable() {
    // 값이 "모름"이거나 비어 있으면 미확인으로 센다
    var fields = [
      { key: 'phone', label: '전화번호' },
      { key: 'homepage', label: '홈페이지' },
      { key: 'hours', label: '운영시간' },
      { key: 'closed', label: '휴관일' },
      { key: 'fee', label: '요금' },
      { key: 'toilet', label: '화장실' },
      { key: 'parking', label: '주차장' },
      { key: 'nursing', label: '수유실' },
      { key: 'telescope', label: '망원경 정보' }
    ];
    var rows = ['<thead><tr><th>항목</th><th>확인됨</th><th>미확인</th><th>미확인 비율</th></tr></thead><tbody>'];
    fields.forEach(function (f) {
      var unknown = PLACES.filter(function (p) {
        var v = p[f.key];
        return !v || v === '모름';
      }).length;
      rows.push('<tr><td>' + esc(f.label) + '</td>' +
        '<td>' + (total - unknown) + '</td><td>' + unknown + '</td>' +
        '<td>' + pct(unknown, total) + '%</td></tr>');
    });
    rows.push('</tbody>');
    document.getElementById('unknownTable').innerHTML = rows.join('');
  }

  /* ---------- 출처 ---------- */
  function sources() {
    document.getElementById('sourceList').innerHTML =
      (DATA_META.sources || []).map(function (s) {
        return '<li>' + esc(s) + '</li>';
      }).join('');
    var note = [];
    if (DATA_META.kasiSeedTotal) {
      note.push('한국천문연구원 국내천문대 목록 ' + DATA_META.kasiSeedTotal +
        '곳(' + esc(DATA_META.kasiFetchedAt || '') + ' 기준)을 시설 누락 검증용 체크리스트로 씁니다. ' +
        '전파 관측 연구시설과 폐관한 곳은 제외했습니다.');
    }
    if (DATA_META.notice) note.push(DATA_META.notice);
    document.getElementById('kasiNote').textContent = note.join(' ');
  }

  /* ---------- 시작 ---------- */
  document.getElementById('totalCount').textContent = total;
  document.getElementById('surveyDate').textContent = DATA_META.surveyDate || '';
  statTiles();
  kindChips();
  levelChips('kidChips', 'kidLevel', KID_LABEL,
    { 1: '#D6F5EC', 2: '#FFF0D6', 3: '#FFDCDC' });
  levelChips('darkChips', 'darkLevel', DARK_LABEL,
    { 1: '#DEE4FF', 2: '#E8EAF6', 3: '#ECEFF4' });
  regionTable();
  unknownTable();
  sources();
})();
