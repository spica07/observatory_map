/* 천문대 지도 — 앱 로직 */
(function () {
  'use strict';

  var PLACES = window.PLACES || [];
  var DATA_META = window.DATA_META || {};

  var KIND_ORDER = ['천문대', '과학관', '관측명소'];
  var KIND_COLOR = { '천문대': '#7B9CFF', '과학관': '#5FD3C0', '관측명소': '#F0B24A' };
  // 종류는 한 가지 언어로만 말한다 — 색 + 도형.
  // 지도 마커, 범례, 필터 칩이 전부 같은 표시를 쓰므로 셋을 잇는 키가 따로 필요 없다.
  // (이모지는 쓰지 않는다 — 기기·폰트마다 모양이 달라지고 지도 UI 규칙에도 어긋난다.)
  var KIND_SHAPE = { '천문대': 'circle', '과학관': 'square', '관측명소': 'diamond' };

  function kindSwatch(k) {
    return '<span class="legend-dot legend-' + (KIND_SHAPE[k] || 'circle') +
      '" style="background:' + kindColor(k) + '" aria-hidden="true"></span>';
  }

  var KID_LABEL = { 1: '유아도 편해요', 2: '보호자 주의', 3: '유아 비권장' };
  var DARK_LABEL = { 1: '은하수 보여요', 2: '별 잘 보여요', 3: '도심 밝아요' };
  var LEVEL_ORDER = [1, 2, 3];
  var RESERVE_ORDER = ['불필요', '권장', '필수'];

  var REGION_ORDER = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  // 지역 배지 바탕색. 글자는 어두운 잉크(#12193a)를 쓰므로 모든 색이 그 잉크와
  // 5.2:1 이상 대비를 내야 한다. 색상(hue)은 지역 식별자라 그대로 두고 명도만 올렸다.
  // 값을 바꿀 때는 대비를 다시 재고 4.5:1 아래로 내려가지 않게 한다.
  var REGION_COLOR = {
    '서울': '#E66381', '부산': '#5A8EE4', '대구': '#E18C46', '인천': '#46B1E1',
    '광주': '#AD76E0', '대전': '#46C78F', '울산': '#7C88D9', '세종': '#C7A446',
    '경기': '#46A0D9', '강원': '#2FA88C', '충북': '#DA699D', '충남': '#B08968',
    '전북': '#8CB446', '전남': '#469FB0', '경북': '#CD7856', '경남': '#8E83DE',
    '제주': '#E19846'
  };
  var REGION_VIEW = {
    '': { center: [36.30, 127.80], zoom: 7 },
    '서울': { center: [37.5642, 126.99], zoom: 11 },
    '경기': { center: [37.42, 127.18], zoom: 9 },
    '인천': { center: [37.46, 126.64], zoom: 11 },
    '부산': { center: [35.17, 129.06], zoom: 11 },
    '대구': { center: [35.85, 128.57], zoom: 11 },
    '광주': { center: [35.15, 126.87], zoom: 12 },
    '대전': { center: [36.34, 127.39], zoom: 12 },
    '울산': { center: [35.55, 129.31], zoom: 11 },
    '제주': { center: [33.38, 126.55], zoom: 10 },
    '세종': { center: [36.55, 127.27], zoom: 11 },
    '강원': { center: [37.75, 128.30], zoom: 8 },
    '충북': { center: [36.75, 127.75], zoom: 9 },
    '충남': { center: [36.50, 126.85], zoom: 9 },
    '전북': { center: [35.75, 127.15], zoom: 9 },
    '전남': { center: [34.85, 126.95], zoom: 9 },
    '경북': { center: [36.35, 128.90], zoom: 8 },
    '경남': { center: [35.25, 128.25], zoom: 9 }
  };

  var state = {
    q: '', region: '', district: '',
    kind: '', kid: '', dark: '', reserve: '',
    fee: false, toilet: false, parking: false, planetarium: false,
    favOnly: false, view: 'list'
  };

  /* 찜은 id(숫자)로 저장하면 안 된다. id 는 build_data.py 가 places.json 순서대로
     매기는 값이라, 데이터를 갱신하면서 항목 하나만 추가돼도 그 뒤 전부가 밀려
     사용자의 찜이 통째로 다른 장소로 옮겨 간다. 지역+이름을 키로 쓴다. */
  function favKey(f) { return f.region + '|' + f.name; }
  function favKeyById(id) {
    var f = PLACES.find(function (x) { return x.id === id; });
    return f ? favKey(f) : null;
  }

  var favorites = loadFavorites();

  function loadFavorites() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem('om_favorites') || '[]'); }
    catch (e) { return new Set(); }
    if (!Array.isArray(raw)) return new Set();
    // 예전 형식(숫자 id)을 쓰던 사용자의 찜을 현재 데이터 기준으로 한 번 옮겨준다
    var migrated = false;
    var keys = raw.map(function (v) {
      if (typeof v !== 'number') return v;
      migrated = true;
      return favKeyById(v);
    }).filter(Boolean);
    var set = new Set(keys);
    if (migrated) {
      try { localStorage.setItem('om_favorites', JSON.stringify(Array.from(set))); } catch (e) {}
    }
    return set;
  }
  function saveFavorites() {
    try { localStorage.setItem('om_favorites', JSON.stringify(Array.from(favorites))); } catch (e) {}
  }
  function loadLastFilters() {
    try { return JSON.parse(localStorage.getItem('om_lastFilters')) || null; }
    catch (e) { return null; }
  }
  function saveLastFilters() {
    try {
      var toggles = {};
      document.querySelectorAll('[data-toggle]').forEach(function (btn) {
        toggles[btn.getAttribute('data-toggle')] = !!state[btn.getAttribute('data-toggle')];
      });
      toggles.district = state.district;
      localStorage.setItem('om_lastFilters', JSON.stringify(toggles));
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u == null ? '' : u)) ? String(u) : '';
  }
  function regionColor(r) { return REGION_COLOR[r] || '#7B9CFF'; }
  function kindColor(k) { return KIND_COLOR[k] || '#7B9CFF'; }
  function districtKey(f) { return f.region + '|' + f.district; }

  /* ---------- 필터링 ---------- */
  function matches(f) {
    if (state.region && f.region !== state.region) return false;
    if (state.district && districtKey(f) !== state.district) return false;
    if (state.kind && f.kind !== state.kind) return false;
    if (state.kid && f.kidLevel !== Number(state.kid)) return false;
    if (state.dark && f.darkLevel !== Number(state.dark)) return false;
    if (state.reserve && f.reserve !== state.reserve) return false;
    if (state.fee && f.isFree !== true) return false;
    if (state.toilet && f.toilet !== '있음') return false;
    if (state.parking && f.parking !== '있음') return false;
    if (state.planetarium && f.planetarium !== true) return false;
    if (state.favOnly && !favorites.has(favKey(f))) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      var hay = [f.name, f.kasiName, f.address, f.district, f.region, f.kind].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  /* ---------- 지도 ----------
     지도는 실패할 수 있는 부분이다. Leaflet 파일이 안 잡히거나 초기화가 던지면
     예전에는 스크립트 전체가 여기서 멈춰 카드·필터·달 위상까지 통째로 사라졌다.
     이제는 지도만 포기하고 나머지는 그대로 렌더한다. map 이 null 일 수 있다는 뜻이라,
     아래 지도 관련 호출은 전부 map 존재를 확인한 뒤 실행한다. */
  var map = null;
  var markerLayer = null;
  var markersById = {};

  function showMapUnavailable() {
    var el = document.getElementById('map');
    if (!el) return;
    el.classList.add('map-unavailable');
    el.innerHTML =
      '<div class="map-fallback" role="status">' +
        '<p class="map-fallback-title">지도를 불러오지 못했어요</p>' +
        '<p class="map-fallback-desc">인터넷 연결을 확인해 주세요. 아래 목록과 검색, 필터는 그대로 쓸 수 있어요.</p>' +
      '</div>';
  }

  function initMap() {
    if (typeof L === 'undefined') return false;
    try {
      map = L.map('map', { zoomControl: true })
        .setView(REGION_VIEW[''].center, REGION_VIEW[''].zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      /* ---------- 독도 ---------- */
      // 배경 지도 표기는 축척·언어에 따라 달라지거나 빠질 수 있다.
      // 우리 지도에서는 독도를 항상 같은 자리에 직접 그린다. (독도 표시)
      // 행정구역: 경상북도 울릉군 울릉읍 독도리
      var dokdo = L.circleMarker([37.2429, 131.8664], {
        radius: 5,
        color: '#f5f7ff',
        weight: 1.6,
        fillColor: '#ffffff',
        fillOpacity: 1
      }).addTo(map);
      dokdo.bindTooltip('독도', {
        permanent: true,
        direction: 'right',
        offset: [6, 0],
        className: 'dokdo-label'
      });
      dokdo.bindPopup('<b>독도</b><br>경상북도 울릉군 울릉읍 독도리');

      markerLayer = L.layerGroup().addTo(map);
      return true;
    } catch (e) {
      console.warn('지도 초기화 실패 — 목록만 표시합니다:', e);
      map = null;
      markerLayer = null;
      return false;
    }
  }

  function flyTo(center, zoom) {
    if (map) map.flyTo(center, zoom, { duration: 0.8 });
  }

  function renderMarkers(list) {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    markersById = {};
    list.forEach(function (f) {
      var icon = L.divIcon({
        className: 'place-pin pin-' + (KIND_SHAPE[f.kind] || 'circle'),
        html: '<span style="background:' + kindColor(f.kind) + '"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      var marker = L.marker([f.lat, f.lng], { icon: icon, title: f.name });
      var popupHtml =
        '<div class="popup-name">' + esc(f.name) + '</div>' +
        '<div class="popup-meta">' + esc(f.region) + ' ' + esc(f.district) + ' · ' + esc(f.kind) +
        (f.isFree === true ? ' · 무료' : '') + '</div>' +
        '<div class="popup-meta">' + esc(KID_LABEL[f.kidLevel] || '') + ' · ' +
        esc(DARK_LABEL[f.darkLevel] || '') + '</div>' +
        '<button class="popup-btn" data-popup-detail="' + f.id + '">자세히 보기</button>';
      marker.bindPopup(popupHtml);
      marker.addTo(markerLayer);
      markersById[f.id] = marker;
    });
  }

  function locateOnMap(id) {
    var f = PLACES.find(function (x) { return x.id === id; });
    if (!f || !map) return;
    if (window.innerWidth <= 900 && state.view !== 'map') {
      state.view = 'map';
      document.querySelectorAll('#viewToggle .pill').forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-view') === 'map');
      });
      var grid = document.querySelector('.content-grid');
      grid.classList.remove('view-list');
      grid.classList.add('view-map');
      setTimeout(function () { map.invalidateSize(); }, 50);
    }
    flyTo([f.lat, f.lng], 14);
    var marker = markersById[f.id];
    if (marker) map.once('moveend', function () { marker.openPopup(); });
  }

  /* ---------- 카드 ---------- */
  // 찜 표시는 이모지 대신 직접 그린 아이콘 — 기기·폰트에 따라 모양이 달라지지 않는다
  var HEART_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 20.4 4.3 12.8a4.8 4.8 0 0 1 6.8-6.8l.9.9.9-.9a4.8 4.8 0 1 1 6.8 6.8z"/></svg>';

  function cardHtml(f) {
    var rc = regionColor(f.region);
    var fav = favorites.has(favKey(f));
    var tags = [
      '<span class="tag district" style="background:' + rc + '">' +
        esc(f.region) + (f.district ? ' ' + esc(f.district) : '') + '</span>',
      '<span class="tag kind" style="background:' + kindColor(f.kind) + '">' + esc(f.kind) + '</span>',
      '<span class="tag kid kid-' + f.kidLevel + '">' + esc(KID_LABEL[f.kidLevel]) + '</span>',
      '<span class="tag dark dark-' + f.darkLevel + '">' + esc(DARK_LABEL[f.darkLevel]) + '</span>'
    ];
    if (f.isFree === true) tags.push('<span class="tag free">무료</span>');
    if (f.reserve === '필수') tags.push('<span class="tag reserve">예약 필수</span>');
    // 내 주변일 때만 붙는다. 그 화면에서는 가장 먼저 읽는 값이라 맨 앞에 둔다.
    if (nearby) { var d = nearby.tag(f); if (d) tags.unshift(d); }
    var info = [];
    if (f.hours) info.push('<div class="card-info">' + esc(f.hours) + '</div>');
    if (f.bestSeason) info.push('<div class="card-info">관측 적기: ' + esc(f.bestSeason) + '</div>');
    // 카드는 눌러서 상세를 여는 컨트롤이다. tabindex/role 없이 <article> 로 두면
    // 키보드 사용자는 87곳 어느 상세도 열 수 없다.
    return (
      '<article class="facility-card" data-id="' + f.id + '"' +
        ' tabindex="0" role="button" aria-label="' + esc(f.name) + ' 자세히 보기">' +
        '<div class="card-body">' +
          '<div class="card-title-row">' +
            '<h3 class="card-name">' + esc(f.name) + '</h3>' +
            '<button class="fav-btn' + (fav ? ' on' : '') + '" data-fav="' + f.id + '"' +
              ' aria-label="' + esc(f.name) + ' 찜" aria-pressed="' + fav + '">' + HEART_ICON + '</button>' +
          '</div>' +
          '<div class="card-tags">' + tags.join('') + '</div>' +
          info.join('') +
          '<button class="card-locate" data-locate="' + f.id + '"' +
            ' aria-label="' + esc(f.name) + ' 지도에서 위치 보기">위치보기</button>' +
        '</div>' +
      '</article>'
    );
  }

  function renderCards(list) {
    document.getElementById('cardGrid').innerHTML = list.map(cardHtml).join('');
    document.getElementById('emptyState').hidden = list.length > 0;
  }

  /* ---------- 상세 모달 ---------- */
  function detailRow(k, v, isLink) {
    if (!v) return '';
    var val = isLink
      ? (safeUrl(v) ? '<a href="' + esc(safeUrl(v)) + '" target="_blank" rel="noopener">' + esc(v) + '</a>' : esc(v))
      : esc(v);
    return '<div class="detail-item"><span class="k">' + k + '</span><span class="v">' + val + '</span></div>';
  }

  function facilityText(f) {
    var parts = [];
    parts.push('화장실 ' + (f.toilet || '모름'));
    parts.push('주차장 ' + (f.parking || '모름'));
    parts.push('수유실 ' + (f.nursing || '모름'));
    return parts.join(' · ');
  }

  window.openFacilityModal = function (id) {
    var f = PLACES.find(function (x) { return x.id === id; });
    if (!f) return;
    var rc = regionColor(f.region);
    var fav = favorites.has(favKey(f));
    var naverUrl = 'https://map.naver.com/p/search/' +
      encodeURIComponent(f.region + ' ' + f.district + ' ' + f.name);
    var feeText = f.fee || (f.isFree === true ? '무료' : '');

    document.getElementById('modalBody').innerHTML =
      '<h2 class="modal-title" id="modalTitle">' + esc(f.name) + '</h2>' +
      (f.kasiName && f.kasiName !== f.name
        ? '<p class="modal-alias">한국천문연구원 목록 표기: ' + esc(f.kasiName) + '</p>' : '') +
      '<div class="modal-tags">' +
        '<span class="tag district" style="background:' + rc + '">' +
          esc(f.region) + (f.district ? ' ' + esc(f.district) : '') + '</span>' +
        '<span class="tag kind" style="background:' + kindColor(f.kind) + '">' + esc(f.kind) + '</span>' +
        (f.isFree === true ? '<span class="tag free">무료</span>' : '') +
        (f.planetarium ? '<span class="tag">천체투영실</span>' : '') +
      '</div>' +

      /* 판정 필드는 근거와 함께, 직접 확인 문구를 붙여 보여준다 */
      '<div class="judge-box">' +
        '<div class="judge-row">' +
          '<span class="judge-badge kid-' + f.kidLevel + '">' + esc(KID_LABEL[f.kidLevel]) + '</span>' +
          '<span class="judge-note">' + esc(f.kidNote || '') + '</span>' +
        '</div>' +
        '<div class="judge-row">' +
          '<span class="judge-badge dark-' + f.darkLevel + '">' + esc(DARK_LABEL[f.darkLevel]) + '</span>' +
          '<span class="judge-note">' + esc(f.darkNote || '') + '</span>' +
        '</div>' +
        '<p class="judge-caveat">이 두 등급은 공공 데이터가 아니라 조사 기반 판정이에요. 방문 전 직접 확인하세요.</p>' +
      '</div>' +

      (f.caution ? '<p class="modal-caution">' + esc(f.caution) + '</p>' : '') +

      '<div class="detail-list">' +
        detailRow('내 위치에서', nearby ? nearby.text(f) : '') +
        detailRow('주소', f.address) +
        detailRow('운영시간', f.hours) +
        detailRow('휴관일', f.closed) +
        detailRow('요금', feeText) +
        detailRow('예약', f.reserve) +
        detailRow('관측 적기', f.bestSeason) +
        detailRow('편의시설', facilityText(f)) +
        detailRow('망원경', f.telescope) +
        detailRow('전화', f.phone) +
        detailRow('조사일', f.checkedAt) +
      '</div>' +

      '<div class="modal-links">' +
        '<a class="link-btn map" href="' + naverUrl + '" target="_blank" rel="noopener">네이버 길찾기</a>' +
        (safeUrl(f.homepage) ? '<a class="link-btn web" href="' + esc(safeUrl(f.homepage)) +
          '" target="_blank" rel="noopener">홈페이지</a>' : '') +
        (safeUrl(f.reserveUrl) && f.reserveUrl !== f.homepage
          ? '<a class="link-btn web" href="' + esc(safeUrl(f.reserveUrl)) +
            '" target="_blank" rel="noopener">예약</a>' : '') +
        (safeUrl(f.source) ? '<a class="link-btn src" href="' + esc(safeUrl(f.source)) +
          '" target="_blank" rel="noopener">근거 자료</a>' : '') +
        '<button class="link-btn fav" data-fav="' + f.id + '">' + (fav ? '찜 해제' : '찜하기') + '</button>' +
      '</div>';
    document.getElementById('modalOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
    // 포커스를 모달 안으로 들여놓지 않으면 탭이 배경 페이지로 계속 새어 나간다
    if (!modalReturnFocus) modalReturnFocus = document.activeElement;
    document.getElementById('modalClose').focus();
  };

  var modalReturnFocus = null;

  function closeModal() {
    var overlay = document.getElementById('modalOverlay');
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.style.overflow = '';
    // 열기 전에 있던 자리로 돌려보낸다 — 목록의 어디였는지 잃지 않게
    if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
    modalReturnFocus = null;
  }

  // 모달이 열려 있는 동안 탭 순환을 모달 안에 가둔다
  function trapTab(e) {
    var overlay = document.getElementById('modalOverlay');
    if (overlay.hidden || e.key !== 'Tab') return;
    var items = overlay.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- 달 위상 패널 ---------- */
  var WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

  function renderMoonPanel() {
    // moon.js 가 없으면 빈 껍데기를 남기는 대신 패널 자체를 접는다
    if (!window.Moon) {
      var panel = document.getElementById('moonPanel');
      if (panel) panel.hidden = true;
      return;
    }
    var today = new Date();
    var illum = Math.round(Moon.illumination(today) * 100);

    document.getElementById('moonDial').style.background = Moon.dialBackground(today);
    document.getElementById('moonPhaseName').textContent = Moon.phaseName(today);
    document.getElementById('moonIllum').textContent =
      '달이 ' + illum + '% 밝아요 (삭 이후 ' + Moon.moonAge(today).toFixed(1) + '일)';

    var advice = document.getElementById('moonAdvice');
    var summary = document.getElementById('moonSummaryLine');
    if (Moon.isMilkyWayNight(today)) {
      advice.className = 'moon-advice good';
      advice.textContent = '오늘은 은하수 보기 좋은 밤이에요. 하늘만 맑다면 어두운 곳으로 떠나 보세요.';
      summary.textContent = '오늘 은하수 보기 좋아요';
      summary.className = 'moon-summary-line good';
    } else if (Moon.isDarkNight(today)) {
      advice.className = 'moon-advice ok';
      advice.textContent = '달빛은 약한 밤이에요. 은하수 중심부는 5~9월에 가장 잘 보여요.';
      summary.textContent = '달빛이 약한 밤이에요';
      summary.className = 'moon-summary-line ok';
    } else {
      advice.className = 'moon-advice bad';
      var next = Moon.nextMilkyWayNight(today);
      advice.textContent = '달이 밝아 은하수는 어려워요.' +
        (next ? ' 다음 기회는 ' + (next.getMonth() + 1) + '월 ' + next.getDate() + '일쯤이에요.' : '') +
        ' 오늘은 천문대에서 달과 행성을 보는 게 좋아요.';
      summary.textContent = next
        ? '다음 은하수 밤 ' + (next.getMonth() + 1) + '월 ' + next.getDate() + '일'
        : '오늘은 달이 밝아요';
      summary.className = 'moon-summary-line bad';
    }

    var y = today.getFullYear(), m = today.getMonth() + 1;
    document.getElementById('moonCalHead').textContent = y + '년 ' + m + '월';
    var phases = Moon.monthPhases(y, m);
    var cells = [];
    WEEKDAY_KO.forEach(function (w) {
      cells.push('<div class="moon-cell head">' + w + '</div>');
    });
    for (var i = 0; i < phases[0].weekday; i++) cells.push('<div class="moon-cell blank"></div>');
    phases.forEach(function (p) {
      var cls = 'moon-cell' +
        (p.milkyWay ? ' milkyway' : (p.dark ? ' darknight' : '')) +
        (p.day === today.getDate() ? ' today' : '');
      // 밤의 상태를 밤하늘 등급 필터로 옮긴다.
      //   은하수 밤 -> 1등급(은하수 보여요)만, 달빛 약한 밤 -> 2등급(별 잘 보여요)까지
      // 달이 밝은 날은 거를 근거가 없으므로 누를 수 없게 둔다.
      var darkTarget = p.milkyWay ? '1' : (p.dark ? '2' : '');
      var label = m + '월 ' + p.day + '일, 달 밝기 ' + Math.round(p.illum * 100) + '%' +
        (darkTarget ? ' — 이 밤에 갈 만한 곳 보기' : '');
      cells.push(
        '<button type="button" class="' + cls + '"' +
          (darkTarget ? ' data-moon-dark="' + darkTarget + '"' : ' disabled') +
          ' title="' + esc(label) + '" aria-label="' + esc(label) + '">' +
          '<span class="moon-cell-day">' + p.day + '</span>' +
          '<span class="moon-cell-dial" style="background:' + Moon.dialBackground(p.date) + '"></span>' +
        '</button>');
    });
    document.getElementById('moonGrid').innerHTML = cells.join('');
  }

  /* ---------- 초기 UI 구성 ---------- */
  function pillRow(containerId, attr, values, labelFn) {
    var row = document.getElementById(containerId);
    var pills = ['<button class="pill active" data-' + attr + '="">전체</button>'];
    values.forEach(function (v) {
      pills.push('<button class="pill" data-' + attr + '="' + v + '">' + labelFn(v) + '</button>');
    });
    row.insertAdjacentHTML('beforeend', pills.join(''));
  }

  function buildFilterPills() {
    var presentR = {}, presentK = {}, presentRes = {};
    PLACES.forEach(function (f) {
      presentR[f.region] = true;
      presentK[f.kind] = true;
      presentRes[f.reserve] = true;
    });
    pillRow('regionFilters', 'region',
      REGION_ORDER.filter(function (r) { return presentR[r]; }), function (r) { return r; });
    pillRow('kindFilters', 'kind',
      KIND_ORDER.filter(function (k) { return presentK[k]; }),
      function (k) { return kindSwatch(k) + k; });
    pillRow('kidFilters', 'kid', LEVEL_ORDER, function (v) { return KID_LABEL[v]; });
    pillRow('darkFilters', 'dark', LEVEL_ORDER, function (v) { return DARK_LABEL[v]; });
    pillRow('reserveFilters', 'reserve',
      RESERVE_ORDER.filter(function (r) { return presentRes[r]; }), function (r) { return r; });
  }

  function buildDistrictSelect() {
    var sel = document.getElementById('districtSelect');
    var byRegion = {};
    PLACES.forEach(function (f) {
      if (!f.district) return;
      if (!byRegion[f.region]) byRegion[f.region] = {};
      byRegion[f.region][f.district] = (byRegion[f.region][f.district] || 0) + 1;
    });
    REGION_ORDER.forEach(function (r) {
      if (!byRegion[r]) return;
      var group = document.createElement('optgroup');
      group.label = r;
      Object.keys(byRegion[r]).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
        .forEach(function (d) {
          var opt = document.createElement('option');
          opt.value = r + '|' + d;
          opt.textContent = r + ' ' + d + ' (' + byRegion[r][d] + ')';
          group.appendChild(opt);
        });
      sel.appendChild(group);
    });
  }

  function buildLegend() {
    document.getElementById('mapLegend').innerHTML = KIND_ORDER.map(function (k) {
      return '<span><span class="legend-dot legend-' + KIND_SHAPE[k] +
        '" style="background:' + KIND_COLOR[k] + '"></span>' + k + '</span>';
    }).join('');
  }

  /* ---------- 지금 걸린 필터 ----------
     예전에는 필터가 접힌 패널 안에서만 보였다. 저장된 토글이 복원되면 사용자는
     걸러진 목록만 보고 왜 그런지 알 방법이 없었다. 무엇이 걸렸는지, 어떻게 푸는지를
     항상 보이는 자리에 둔다. */
  var TOGGLE_LABEL = {
    fee: '무료만', toilet: '화장실', parking: '주차장',
    planetarium: '천체투영실', favOnly: '찜만 보기'
  };

  function activeFilterList() {
    var out = [];
    if (state.q) out.push({ key: 'q', label: '검색: ' + state.q });
    if (state.region) out.push({ key: 'region', label: state.region });
    if (state.district) out.push({ key: 'district', label: state.district.replace('|', ' ') });
    if (state.kind) out.push({ key: 'kind', label: state.kind });
    if (state.kid) out.push({ key: 'kid', label: KID_LABEL[state.kid] });
    if (state.dark) out.push({ key: 'dark', label: DARK_LABEL[state.dark] });
    if (state.reserve) out.push({ key: 'reserve', label: '예약 ' + state.reserve });
    Object.keys(TOGGLE_LABEL).forEach(function (k) {
      if (state[k]) out.push({ key: k, label: TOGGLE_LABEL[k] });
    });
    return out;
  }

  function renderActiveFilters() {
    var active = activeFilterList();
    document.getElementById('activeFilters').hidden = active.length === 0;
    document.getElementById('activeFilterChips').innerHTML = active.map(function (a) {
      return '<button type="button" class="chip" data-clear="' + a.key + '"' +
        ' aria-label="' + esc(a.label) + ' 필터 해제">' + esc(a.label) +
        '<svg class="ico chip-x" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    }).join('');

    var badge = document.getElementById('filterCount');
    badge.hidden = active.length === 0;
    badge.textContent = active.length;
  }

  /* ---------- URL 반영 ----------
     공유 링크가 지금 보고 있는 화면을 그대로 담게 한다. */
  function syncUrl() {
    var p = new URLSearchParams();
    ['q', 'region', 'district', 'kind', 'kid', 'dark', 'reserve'].forEach(function (k) {
      if (state[k]) p.set(k, state[k]);
    });
    Object.keys(TOGGLE_LABEL).forEach(function (k) { if (state[k]) p.set(k, '1'); });
    var qs = p.toString();
    try {
      history.replaceState(null, '', qs ? location.pathname + '?' + qs : location.pathname);
    } catch (e) {}
  }

  /* ---------- 내 주변 ----------
     권한 요청·거리 계산·내 위치 마커는 geo.js(지도 앱 공용)가 맡는다.
     이 앱이 알려줄 것은 좌표를 꺼내는 법과 지역 필터를 푸는 법뿐이다.
     nearby 는 지도 초기화 뒤에 만들어지므로 그 전에 render 가 불릴 수 있다 —
     그때는 정렬 없이 그대로 그린다. */
  var nearby = null;

  /* 지역 필터만 조용히 푼다 — setRegion/setDistrict 는 지도를 날리고 render 까지
     부르므로 켜는 길목에서 쓰면 화면이 두 번 튄다. */
  function clearRegion() {
    state.region = '';
    state.district = '';
    document.getElementById('districtSelect').value = '';
    document.querySelectorAll('#regionFilters .pill').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-region') === '');
    });
  }

  /* ---------- 렌더 ---------- */
  function render() {
    var list = PLACES.filter(matches);
    if (nearby) list = nearby.sort(list);
    renderMarkers(list);
    renderCards(list);
    renderActiveFilters();
    syncUrl();
    document.getElementById('resultCount').textContent =
      (nearby && nearby.active())
        ? '가까운 ' + list.length + '곳'
        : '총 ' + list.length + '곳' + (list.length < PLACES.length ? ' (전체 ' + PLACES.length + '곳 중)' : '');
  }

  /* ---------- 이벤트 ---------- */
  function setDistrict(key) {
    if (nearby) nearby.off();   /* 시군구를 고르는 건 내 주변을 그만두겠다는 뜻이다 */
    state.district = key;
    document.getElementById('districtSelect').value = key;
    if (key) {
      var parts = key.split('|');
      var sub = PLACES.filter(function (f) { return f.region === parts[0] && f.district === parts[1]; });
      if (sub.length) {
        var lat = sub.reduce(function (s, f) { return s + f.lat; }, 0) / sub.length;
        var lng = sub.reduce(function (s, f) { return s + f.lng; }, 0) / sub.length;
        flyTo([lat, lng], 12);
      }
    } else {
      var v = REGION_VIEW[state.region] || REGION_VIEW[''];
      flyTo(v.center, v.zoom);
    }
    saveLastFilters();
    render();
  }

  function setRegion(r) {
    if (nearby) nearby.off();   /* 지역을 고르는 건 내 주변을 그만두겠다는 뜻이다 */
    state.region = r;
    if (state.district && r && state.district.split('|')[0] !== r) {
      state.district = '';
      document.getElementById('districtSelect').value = '';
    }
    document.querySelectorAll('#regionFilters .pill').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-region') === r);
    });
    if (!state.district) {
      var v = REGION_VIEW[r] || REGION_VIEW[''];
      flyTo(v.center, v.zoom);
    }
    render();
  }

  var searchTimer = null;
  document.getElementById('searchInput').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.q = e.target.value.trim();
      render();
    }, 200);
  });

  document.getElementById('districtSelect').addEventListener('change', function (e) {
    setDistrict(e.target.value);
  });

  var filterToggleBtn = document.getElementById('filterToggleBtn');
  var filterGroups = document.getElementById('filterGroups');
  function setFilterPanel(open) {
    filterGroups.hidden = !open;
    filterToggleBtn.setAttribute('aria-expanded', String(open));
  }
  filterToggleBtn.addEventListener('click', function () {
    setFilterPanel(filterGroups.hidden);
  });

  var moonToggle = document.getElementById('moonToggle');
  var moonDetail = document.getElementById('moonDetail');
  function setMoonPanel(open) {
    moonDetail.hidden = !open;
    moonToggle.setAttribute('aria-expanded', String(open));
  }
  moonToggle.addEventListener('click', function () {
    setMoonPanel(moonDetail.hidden);
  });

  // data-<key> 형태의 단일선택 필터를 한 곳에서 처리한다
  var SINGLE_FILTERS = [
    { attr: 'kind', row: 'kindFilters' },
    { attr: 'kid', row: 'kidFilters' },
    { attr: 'dark', row: 'darkFilters' },
    { attr: 'reserve', row: 'reserveFilters' }
  ];
  var ROW_BY_ATTR = { kind: 'kindFilters', kid: 'kidFilters', dark: 'darkFilters', reserve: 'reserveFilters' };

  // 칩을 직접 누르지 않고 값을 바꿀 때도 칩의 선택 표시가 따라오게 한다
  function setSingleFilter(attr, value) {
    state[attr] = value;
    var row = ROW_BY_ATTR[attr];
    if (row) {
      document.querySelectorAll('#' + row + ' .pill').forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-' + attr) === value);
      });
    }
  }

  function clearFilter(key) {
    if (key === 'q') {
      state.q = '';
      document.getElementById('searchInput').value = '';
    } else if (key === 'region') {
      setRegion('');
      return;
    } else if (key === 'district') {
      setDistrict('');
      return;
    } else if (ROW_BY_ATTR[key]) {
      setSingleFilter(key, '');
    } else if (key in TOGGLE_LABEL) {
      state[key] = false;
      document.querySelectorAll('[data-toggle="' + key + '"]').forEach(function (p) {
        p.classList.remove('active');
      });
      saveLastFilters();
    }
    render();
  }

  function resetFilters() {
    state.q = ''; state.region = ''; state.kind = '';
    state.kid = ''; state.dark = ''; state.reserve = '';
    state.fee = false; state.toilet = false; state.parking = false;
    state.planetarium = false; state.favOnly = false;
    document.getElementById('searchInput').value = '';
    // 필터 칩만 훑는다 — .filter-bar 전체를 훑으면 같은 패널에 있는
    // 지도/목록 전환 버튼까지 active 가 벗겨진다
    document.querySelectorAll('.filter-groups .pill').forEach(function (p) {
      var isAll = ['region', 'kind', 'kid', 'dark', 'reserve'].some(function (a) {
        return p.getAttribute('data-' + a) === '';
      });
      p.classList.toggle('active', isAll);
    });
    document.querySelectorAll('[data-toggle]').forEach(function (p) { p.classList.remove('active'); });
    saveLastFilters();
    setDistrict('');
  }

  document.addEventListener('click', function (e) {
    var t = e.target;

    var favBtn = t.closest('[data-fav]');
    if (favBtn) {
      e.stopPropagation();
      var id = Number(favBtn.getAttribute('data-fav'));
      var key = favKeyById(id);
      if (!key) return;
      if (favorites.has(key)) favorites.delete(key); else favorites.add(key);
      saveFavorites();
      render();
      if (!document.getElementById('modalOverlay').hidden) window.openFacilityModal(id);
      return;
    }

    var locateBtn = t.closest('[data-locate]');
    if (locateBtn) {
      e.stopPropagation();
      locateOnMap(Number(locateBtn.getAttribute('data-locate')));
      return;
    }

    // 달력 날짜 -> 밤하늘 등급 필터. 이 앱의 두 자산(달 위상·어둠 등급)을 잇는 지점.
    var moonCell = t.closest('[data-moon-dark]');
    if (moonCell) {
      setSingleFilter('dark', moonCell.getAttribute('data-moon-dark'));
      setFilterPanel(true);
      render();
      document.querySelector('.content-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    var clearChip = t.closest('[data-clear]');
    if (clearChip) { clearFilter(clearChip.getAttribute('data-clear')); return; }

    var popupBtn = t.closest('[data-popup-detail]');
    if (popupBtn) {
      window.openFacilityModal(Number(popupBtn.getAttribute('data-popup-detail')));
      return;
    }

    var regionPill = t.closest('[data-region]');
    if (regionPill) { setRegion(regionPill.getAttribute('data-region')); return; }

    for (var i = 0; i < SINGLE_FILTERS.length; i++) {
      var cfg = SINGLE_FILTERS[i];
      var pill = t.closest('[data-' + cfg.attr + ']');
      if (pill) {
        state[cfg.attr] = pill.getAttribute('data-' + cfg.attr);
        document.querySelectorAll('#' + cfg.row + ' .pill').forEach(function (p) {
          p.classList.toggle('active', p === pill);
        });
        render();
        return;
      }
    }

    var togglePill = t.closest('[data-toggle]');
    if (togglePill) {
      var key = togglePill.getAttribute('data-toggle');
      state[key] = !state[key];
      document.querySelectorAll('[data-toggle="' + key + '"]').forEach(function (p) {
        p.classList.toggle('active', state[key]);
      });
      saveLastFilters();
      render();
      return;
    }

    var viewBtn = t.closest('[data-view]');
    if (viewBtn) {
      state.view = viewBtn.getAttribute('data-view');
      document.querySelectorAll('#viewToggle .pill').forEach(function (p) {
        p.classList.toggle('active', p === viewBtn);
      });
      var grid = document.querySelector('.content-grid');
      grid.classList.remove('view-map', 'view-list');
      grid.classList.add('view-' + state.view);
      if (state.view === 'map' && map) setTimeout(function () { map.invalidateSize(); }, 50);
      return;
    }

    var card = t.closest('.facility-card');
    if (card) { window.openFacilityModal(Number(card.getAttribute('data-id'))); return; }

    if (t.id === 'modalClose' || t.id === 'modalOverlay') closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); return; }
    trapTab(e);
    // 카드는 role="button" 이므로 Enter·Space 로도 열려야 한다
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      var card = e.target.closest && e.target.closest('.facility-card');
      if (card && e.target === card) {
        e.preventDefault();
        window.openFacilityModal(Number(card.getAttribute('data-id')));
      }
    }
  });

  document.getElementById('clearAllBtn').addEventListener('click', resetFilters);
  document.getElementById('emptyResetBtn').addEventListener('click', resetFilters);

  /* ---------- 시작 ---------- */
  document.getElementById('surveyDate').textContent = DATA_META.surveyDate || '';
  // 지도를 가장 먼저 세운다. 실패하면 안내만 남기고 나머지 렌더는 그대로 진행한다.
  var mapReady = initMap();
  if (!mapReady) showMapUnavailable();

  /* 지도가 준비된 뒤에 만든다 — 내 위치 마커를 그 지도 위에 올리기 때문이다.
     지도가 없으면 map: null 로 넘어가 마커만 빠지고 거리 정렬은 그대로 된다.
     geo.js 를 못 받은 경우에도 앱 전체가 멈추면 안 된다(Leaflet 과 같은 원칙) —
     '내 주변' 버튼만 감추고 나머지는 그대로 쓴다. */
  if (typeof window.createNearby === 'function') {
    nearby = window.createNearby({
      map: map,
      button: document.getElementById('nearbyBtn'),
      label: document.getElementById('nearbyLabel'),
      notice: document.getElementById('nearbyNotice'),
      /* geo.js 는 안내 문구를 '<unit>이 없어요' 로 조립한다. 받침이 없는 말을 넣으면
         "천문대이 없어요" 가 되므로, 세 종류를 아우르면서 받침으로 끝나는 말을 쓴다. */
      unitLabel: '천문 시설',
      /* 전국 87곳이라 정렬만 하면 제주까지 '가까운 곳'에 섞인다. 가까운 20곳만 남긴다. */
      limit: 20,
      latLngOf: function (f) { return [f.lat, f.lng]; },
      onClear: clearRegion,
      onChange: render
    });
  } else {
    console.warn('geo.js 를 불러오지 못했어요 — 내 주변 기능만 빠집니다.');
    document.getElementById('nearbyBtn').hidden = true;
  }

  renderMoonPanel();
  buildFilterPills();
  buildDistrictSelect();
  if (mapReady) buildLegend();
  if (window.innerWidth <= 900) {
    document.querySelector('.content-grid').classList.add('view-list');
  }
  // 필터 패널은 넓은 화면에서도 접어둔다. 펼쳐두면 지도가 첫 화면 밖으로 밀려
  // 주 작업이 가려진다. 발견 문제는 버튼에 '필터' 라는 이름과 적용 개수를 붙여 푼다.

  /* URL 이 우선, 없으면 지난번 필터. 어느 쪽이든 상태를 복원했으면
     활성 필터 줄에 그대로 드러나므로 "왜 걸러졌는지" 를 알 수 있다. */
  var params = new URLSearchParams(location.search);
  var restored = false;

  ['q', 'kind', 'kid', 'dark', 'reserve'].forEach(function (k) {
    var v = params.get(k);
    if (!v) return;
    restored = true;
    if (k === 'q') { state.q = v; document.getElementById('searchInput').value = v; }
    else setSingleFilter(k, v);
  });
  Object.keys(TOGGLE_LABEL).forEach(function (k) {
    if (params.get(k) !== '1') return;
    restored = true;
    state[k] = true;
    document.querySelectorAll('[data-toggle="' + k + '"]').forEach(function (p) { p.classList.add('active'); });
  });

  var paramDistrict = params.get('district');
  var paramRegion = params.get('region');
  if (paramDistrict && paramDistrict.indexOf('|') !== -1) {
    setDistrict(paramDistrict);
  } else if (paramRegion && REGION_VIEW[paramRegion]) {
    setRegion(paramRegion);
  } else if (restored) {
    render();
  } else {
    var savedFilters = loadLastFilters();
    if (savedFilters) {
      document.querySelectorAll('[data-toggle]').forEach(function (btn) {
        var key = btn.getAttribute('data-toggle');
        if (savedFilters[key]) { state[key] = true; btn.classList.add('active'); }
      });
      if (savedFilters.district && savedFilters.district.indexOf('|') !== -1) {
        setDistrict(savedFilters.district);
      } else {
        render();
      }
    } else {
      render();
    }
  }

  // PWA: 서비스 워커 등록 (홈 화면 설치 · 오프라인 지원)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('서비스 워커 등록 실패:', err);
      });
    });
  }
})();
