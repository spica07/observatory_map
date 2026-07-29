/* 달 위상 계산 — 외부 의존성 없음, 오프라인 동작
 *
 * 은하수를 보러 갈 밤을 고르는 데 필요한 정보만 계산한다.
 *  - 달의 나이(삭 이후 지난 일수)와 조명 비율
 *  - 그 날이 "은하수 보기 좋은 밤"인지 (삭 ±5일 이면서 5~9월)
 *
 * 정확도: 평균 삭망월(29.530588853일)을 쓰는 간이 계산이다.
 * 실제 삭 시각과 최대 약 반나절 차이가 날 수 있는데, "며칠쯤이 그믐인가"를
 * 보는 용도로는 충분하다. 관측 계획에 분 단위 정밀도는 필요하지 않다.
 */
(function (global) {
  'use strict';

  var SYNODIC = 29.530588853;           // 평균 삭망월 (일)
  // 기준 삭: 2000-01-06 18:14 UTC (율리우스일 2451550.26)
  var KNOWN_NEW_MOON_JD = 2451550.26;

  var PHASE_NAMES = [
    { max: 1.0, name: '삭 (그믐)' },
    { max: 6.4, name: '초승달' },
    { max: 8.4, name: '상현달' },
    { max: 13.8, name: '차오르는 달' },
    { max: 15.8, name: '보름달' },
    { max: 21.1, name: '기우는 달' },
    { max: 23.1, name: '하현달' },
    { max: 28.5, name: '새벽 그믐달' },
    { max: 30.0, name: '삭 (그믐)' }
  ];

  // 은하수가 잘 보이는 조건
  var DARK_NIGHT_AGE = 5;               // 삭 기준 ±5일
  var MILKYWAY_MONTHS = [5, 6, 7, 8, 9]; // 우리 은하 중심부가 높이 뜨는 달

  function toJulian(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  /** 달의 나이(일). 0 = 삭, 약 14.77 = 보름. */
  function moonAge(date) {
    var days = toJulian(date) - KNOWN_NEW_MOON_JD;
    var age = days % SYNODIC;
    if (age < 0) age += SYNODIC;
    return age;
  }

  /** 조명 비율 0~1. 0 = 삭, 1 = 보름. */
  function illumination(date) {
    var phase = (moonAge(date) / SYNODIC) * 2 * Math.PI;
    return (1 - Math.cos(phase)) / 2;
  }

  function phaseName(date) {
    var age = moonAge(date);
    for (var i = 0; i < PHASE_NAMES.length; i++) {
      if (age < PHASE_NAMES[i].max) return PHASE_NAMES[i].name;
    }
    return '삭 (그믐)';
  }

  /** 삭에 가까운 밤인지 (달빛이 은하수를 지우지 않는 밤). */
  function isDarkNight(date) {
    var age = moonAge(date);
    return age <= DARK_NIGHT_AGE || age >= SYNODIC - DARK_NIGHT_AGE;
  }

  /** 은하수 보기 좋은 밤인지 — 달빛이 없고, 은하 중심부가 높이 뜨는 달인지. */
  function isMilkyWayNight(date) {
    return isDarkNight(date) && MILKYWAY_MONTHS.indexOf(date.getMonth() + 1) !== -1;
  }

  /** 오늘 이후 가장 가까운 "은하수 보기 좋은 밤". 1년 안에 없으면 null. */
  function nextMilkyWayNight(from) {
    var d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    for (var i = 0; i < 400; i++) {
      if (isMilkyWayNight(d)) return d;
      d.setDate(d.getDate() + 1);
    }
    return null;
  }

  /** 한 달치 달 위상. 달력 렌더에 쓴다. */
  function monthPhases(year, month /* 1~12 */) {
    var out = [];
    var last = new Date(year, month, 0).getDate();
    for (var day = 1; day <= last; day++) {
      var d = new Date(year, month - 1, day);
      out.push({
        date: d,
        day: day,
        weekday: d.getDay(),
        age: moonAge(d),
        illum: illumination(d),
        dark: isDarkNight(d),
        milkyWay: isMilkyWayNight(d)
      });
    }
    return out;
  }

  /** 달 모양을 그리는 CSS background 값. 0=삭(검정) → 1=보름(흰색) */
  function dialBackground(date) {
    var age = moonAge(date);
    var illum = illumination(date);
    var lit = Math.round(illum * 100);
    // 상현(차오름)은 오른쪽이 밝고, 하현(기움)은 왼쪽이 밝다
    var waxing = age < SYNODIC / 2;
    var from = waxing ? 'to left' : 'to right';
    return 'linear-gradient(' + from + ', #10142b 0%, #10142b ' + (100 - lit) +
      '%, #ffeaa7 ' + (100 - lit) + '%, #fff8dc 100%)';
  }

  global.Moon = {
    SYNODIC: SYNODIC,
    moonAge: moonAge,
    illumination: illumination,
    phaseName: phaseName,
    isDarkNight: isDarkNight,
    isMilkyWayNight: isMilkyWayNight,
    nextMilkyWayNight: nextMilkyWayNight,
    monthPhases: monthPhases,
    dialBackground: dialBackground
  };
})(window);
