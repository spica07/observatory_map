/* 천문대 지도 — 앱 로직 */
(function () {
  'use strict';

  var PLACES = window.PLACES || [];
  var DATA_META = window.DATA_META || {};

  var KIND_ORDER = ['천문대', '과학관', '관측명소'];
  var KIND_COLOR = { '천문대': '#7B9CFF', '과학관': '#5FD3C0', '관측명소': '#F0B24A' };
  var KIND_EMOJI = { '천문대': '🔭', '과학관': '🪐', '관측명소': '✨' };
  var KIND_SHAPE = { '천문대': 'circle', '과학관': 'square', '관측명소': 'diamond' };

  var KID_LABEL = { 1: '유아도 편해요', 2: '보호자 주의', 3: '유아 비권장' };
  var DARK_LABEL = { 1: '은하수 보여요', 2: '별 잘 보여요', 3: '도심 밝아요' };
  var LEVEL_ORDER = [1, 2, 3];
  var RESERVE_ORDER = ['불필요', '권장', '필수'];

  var REGION_ORDER = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  var REGION_COLOR = {
    '서울': '#E1466A', '부산': '#4680E1', '대구': '#E18C46', '인천': '#46B1E1',
    '광주': '#9B59D9', '대전': '#46C78F', '울산': '#5A6ACF', '세종': '#C7A446',
    '경기': '#46A0D9', '강원': '#2FA88C', '충북': '#D9679C', '충남': '#B08968',
    '전북': '#8CB446', '전남': '#469FB0', '경북': '#C96F4A', '경남': '#7C6FD9',
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

  var favorites = loadFavorites();

  function loadFavorites() {
    try { return new Set(JSON.parse(localStorage.getItem('om_favorites') || '[]')); }
    catch (e) { return new Set(); }
  }
  function saveFavorites() {
    localStorage.setItem('om_favorites', JSON.stringify(Array.from(favorites)));
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
    if (state.favOnly && !favorites.has(f.id)) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      var hay = [f.name, f.kasiName, f.address, f.district, f.region, f.kind].join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  /* ---------- 지도 ---------- */
  var map = L.map('map', { zoomControl: true })
    .setView(REGION_VIEW[''].center, REGION_VIEW[''].zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  /* ---------- 독도 ---------- */
  // 배경 지도 표기는 축척·언어에 따라 달라지거나 빠질 수 있다.
  // 우리 지도에서는 독도를 항상 같은 자리에 직접 그린다. (독도 표시)
  // 행정구역: 경상북도 울릉군 울릉읍 독도리
  (function markDokdo() {
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
  })();

  var markerLayer = L.layerGroup().addTo(map);
  var markersById = {};

  function renderMarkers(list) {
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
    if (!f) return;
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
    map.flyTo([f.lat, f.lng], 14, { duration: 0.8 });
    var marker = markersById[f.id];
    if (marker) map.once('moveend', function () { marker.openPopup(); });
  }

  /* ---------- 카드 ---------- */
  function cardHtml(f) {
    var rc = regionColor(f.region);
    var fav = favorites.has(f.id);
    var tags = [
      '<span class="tag district" style="background:' + rc + '">' +
        esc(f.region) + (f.district ? ' ' + esc(f.district) : '') + '</span>',
      '<span class="tag kind" style="background:' + kindColor(f.kind) + '">' + esc(f.kind) + '</span>',
      '<span class="tag kid kid-' + f.kidLevel + '">' + esc(KID_LABEL[f.kidLevel]) + '</span>',
      '<span class="tag dark dark-' + f.darkLevel + '">' + esc(DARK_LABEL[f.darkLevel]) + '</span>'
    ];
    if (f.isFree === true) tags.push('<span class="tag free">무료</span>');
    if (f.reserve === '필수') tags.push('<span class="tag reserve">예약 필수</span>');
    var info = [];
    if (f.hours) info.push('<div class="card-info">' + esc(f.hours) + '</div>');
    if (f.bestSeason) info.push('<div class="card-info">관측 적기: ' + esc(f.bestSeason) + '</div>');
    return (
      '<article class="facility-card" data-id="' + f.id + '">' +
        '<div class="card-body">' +
          '<div class="card-title-row">' +
            '<h3 class="card-name">' + (KIND_EMOJI[f.kind] || '') + ' ' + esc(f.name) + '</h3>' +
            '<button class="fav-btn" data-fav="' + f.id + '" aria-label="찜">' + (fav ? '❤️' : '🤍') + '</button>' +
          '</div>' +
          '<div class="card-tags">' + tags.join('') + '</div>' +
          info.join('') +
          '<button class="card-locate" data-locate="' + f.id + '">위치보기</button>' +
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
    var fav = favorites.has(f.id);
    var naverUrl = 'https://map.naver.com/p/search/' +
      encodeURIComponent(f.region + ' ' + f.district + ' ' + f.name);
    var feeText = f.fee || (f.isFree === true ? '무료' : '');

    document.getElementById('modalBody').innerHTML =
      '<h2 class="modal-title">' + (KIND_EMOJI[f.kind] || '') + ' ' + esc(f.name) + '</h2>' +
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
  };

  function closeModal() {
    document.getElementById('modalOverlay').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------- 달 위상 패널 ---------- */
  var WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

  function renderMoonPanel() {
    if (!window.Moon) return;
    var today = new Date();
    var illum = Math.round(Moon.illumination(today) * 100);

    document.getElementById('moonDial').style.background = Moon.dialBackground(today);
    document.getElementById('moonPhaseName').textContent = Moon.phaseName(today);
    document.getElementById('moonIllum').textContent =
      '달이 ' + illum + '% 밝아요 (삭 이후 ' + Moon.moonAge(today).toFixed(1) + '일)';

    var advice = document.getElementById('moonAdvice');
    if (Moon.isMilkyWayNight(today)) {
      advice.className = 'moon-advice good';
      advice.textContent = '오늘은 은하수 보기 좋은 밤이에요. 하늘만 맑다면 어두운 곳으로 떠나 보세요.';
    } else if (Moon.isDarkNight(today)) {
      advice.className = 'moon-advice ok';
      advice.textContent = '달빛은 약한 밤이에요. 은하수 중심부는 5~9월에 가장 잘 보여요.';
    } else {
      advice.className = 'moon-advice bad';
      var next = Moon.nextMilkyWayNight(today);
      advice.textContent = '달이 밝아 은하수는 어려워요.' +
        (next ? ' 다음 기회는 ' + (next.getMonth() + 1) + '월 ' + next.getDate() + '일쯤이에요.' : '') +
        ' 오늘은 천문대에서 달과 행성을 보는 게 좋아요.';
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
      cells.push(
        '<div class="' + cls + '" title="달 밝기 ' + Math.round(p.illum * 100) + '%">' +
          '<span class="moon-cell-day">' + p.day + '</span>' +
          '<span class="moon-cell-dial" style="background:' + Moon.dialBackground(p.date) + '"></span>' +
        '</div>');
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
      function (k) { return KIND_EMOJI[k] + ' ' + k; });
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

  /* ---------- 렌더 ---------- */
  function render() {
    var list = PLACES.filter(matches);
    renderMarkers(list);
    renderCards(list);
    document.getElementById('resultCount').textContent =
      '총 ' + list.length + '곳' + (list.length < PLACES.length ? ' (전체 ' + PLACES.length + '곳 중)' : '');
  }

  /* ---------- 이벤트 ---------- */
  function setDistrict(key) {
    state.district = key;
    document.getElementById('districtSelect').value = key;
    if (key) {
      var parts = key.split('|');
      var sub = PLACES.filter(function (f) { return f.region === parts[0] && f.district === parts[1]; });
      if (sub.length) {
        var lat = sub.reduce(function (s, f) { return s + f.lat; }, 0) / sub.length;
        var lng = sub.reduce(function (s, f) { return s + f.lng; }, 0) / sub.length;
        map.flyTo([lat, lng], 12, { duration: 0.8 });
      }
    } else {
      var v = REGION_VIEW[state.region] || REGION_VIEW[''];
      map.flyTo(v.center, v.zoom, { duration: 0.8 });
    }
    saveLastFilters();
    render();
  }

  function setRegion(r) {
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
      map.flyTo(v.center, v.zoom, { duration: 0.8 });
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
  filterToggleBtn.addEventListener('click', function () {
    var willOpen = filterGroups.hidden;
    filterGroups.hidden = !willOpen;
    filterToggleBtn.textContent = willOpen ? '▲' : '▼';
    var label = willOpen ? '필터 닫기' : '필터 열기';
    filterToggleBtn.title = label;
    filterToggleBtn.setAttribute('aria-label', label);
    filterToggleBtn.setAttribute('aria-expanded', String(willOpen));
  });

  var moonToggle = document.getElementById('moonToggle');
  var moonCalendar = document.getElementById('moonCalendar');
  moonToggle.addEventListener('click', function () {
    var willOpen = moonCalendar.hidden;
    moonCalendar.hidden = !willOpen;
    moonToggle.textContent = willOpen ? '달력 닫기' : '이번 달 달력';
    moonToggle.setAttribute('aria-expanded', String(willOpen));
  });

  // data-<key> 형태의 단일선택 필터를 한 곳에서 처리한다
  var SINGLE_FILTERS = [
    { attr: 'kind', row: 'kindFilters' },
    { attr: 'kid', row: 'kidFilters' },
    { attr: 'dark', row: 'darkFilters' },
    { attr: 'reserve', row: 'reserveFilters' }
  ];

  document.addEventListener('click', function (e) {
    var t = e.target;

    var favBtn = t.closest('[data-fav]');
    if (favBtn) {
      e.stopPropagation();
      var id = Number(favBtn.getAttribute('data-fav'));
      if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
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
      if (state.view === 'map') setTimeout(function () { map.invalidateSize(); }, 50);
      return;
    }

    var card = t.closest('.facility-card');
    if (card) { window.openFacilityModal(Number(card.getAttribute('data-id'))); return; }

    if (t.id === 'modalClose' || t.id === 'modalOverlay') closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  document.getElementById('resetBtn').addEventListener('click', function () {
    state.q = ''; state.region = ''; state.kind = '';
    state.kid = ''; state.dark = ''; state.reserve = '';
    state.fee = false; state.toilet = false; state.parking = false;
    state.planetarium = false; state.favOnly = false;
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.filter-bar .pill').forEach(function (p) {
      var isAll = ['region', 'kind', 'kid', 'dark', 'reserve'].some(function (a) {
        return p.getAttribute('data-' + a) === '';
      });
      p.classList.toggle('active', isAll);
    });
    document.querySelectorAll('[data-toggle]').forEach(function (p) { p.classList.remove('active'); });
    setDistrict('');
  });

  /* ---------- 시작 ---------- */
  document.getElementById('surveyDate').textContent = DATA_META.surveyDate || '';
  renderMoonPanel();
  buildFilterPills();
  buildDistrictSelect();
  buildLegend();
  if (window.innerWidth <= 900) {
    document.querySelector('.content-grid').classList.add('view-list');
  }

  var params = new URLSearchParams(location.search);
  var paramDistrict = params.get('district');
  var paramRegion = params.get('region');
  if (paramDistrict && paramDistrict.indexOf('|') !== -1) {
    setDistrict(paramDistrict);
  } else if (paramRegion && REGION_VIEW[paramRegion]) {
    setRegion(paramRegion);
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
