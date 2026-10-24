(function () {
  function getMonthIndex(monthName) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return Math.max(months.indexOf(monthName), 0);
  }

  function parseFieldValue(id, fallback = 0) {
    const element = document.getElementById(id);
    if (!element) return fallback;
    const value = element.value.trim();
    if (value === '') return fallback;
    return parseInt(value, 10) || fallback;
  }

  function getSignFromLongitude(longitude) {
    const signs = [
      'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
      'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
    ];
    return signs[Math.floor(((longitude % 360) + 360) / 30) % 12];
  }

  function getAyanamsa(time) {
    if (typeof window.Astronomy.PrecessionAngle === 'function') {
      return window.Astronomy.PrecessionAngle(time, window.Astronomy.MakeTime(2000, 1, 1, 12, 0, 0)) * 180 / Math.PI;
    }
    return 0;
  }

  function formatDegree(deg) {
    const normalized = ((deg % 360) + 360) % 360;
    const signIndex = Math.floor(normalized / 30);
    const signDegree = normalized - signIndex * 30;
    return `${Math.floor(signDegree)}° ${['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'][signIndex]}`;
  }

  function calculatePositions(formData) {
    const monthIndex = getMonthIndex(formData.month) + 1;
    const localDate = new Date(formData.year, monthIndex - 1, formData.day, formData.hour, formData.minute);
    const time = window.Astronomy.MakeTime(localDate);
    const bodies = [
      { name: 'Sun', body: window.Astronomy.Body.Sun },
      { name: 'Moon', body: window.Astronomy.Body.Moon },
      { name: 'Mercury', body: window.Astronomy.Body.Mercury },
      { name: 'Venus', body: window.Astronomy.Body.Venus },
      { name: 'Mars', body: window.Astronomy.Body.Mars },
      { name: 'Jupiter', body: window.Astronomy.Body.Jupiter },
      { name: 'Saturn', body: window.Astronomy.Body.Saturn },
      { name: 'Uranus', body: window.Astronomy.Body.Uranus },
      { name: 'Neptune', body: window.Astronomy.Body.Neptune },
      { name: 'Pluto', body: window.Astronomy.Body.Pluto }
    ];

    const data = bodies.map(({ name, body }) => {
      const positionData = window.Astronomy.GeoVector(body, time, true);
      const ecl = window.Astronomy.Ecliptic(positionData);
      const longitude = ((ecl.elon || 0) + 360) % 360;
      return {
        name,
        longitude,
        sign: getSignFromLongitude(longitude),
        display: `${name} ${formatDegree(longitude)}`
      };
    });

    const sidereal = window.Astronomy.SiderealTime(time);
    const asc = ((sidereal * 15 + formData.longitude) % 360 + 360) % 360;
    data.push({ name: 'Ascendant', longitude: asc, sign: getSignFromLongitude(asc), display: `Ascendant ${formatDegree(asc)}` });
    return data;
  }

  function drawWheel(planets) {
    const container = document.getElementById('natal-chart');
    if (!container) return;
    container.innerHTML = '';

    const size = Math.min(520, window.innerWidth - 40);
    const svg = d3.select(container)
      .append('svg')
      .attr('width', size)
      .attr('height', size)
      .style('max-width', '100%');

    const radius = size / 2 - 10;
    const center = { x: size / 2, y: size / 2 };

    svg.append('circle')
      .attr('cx', center.x)
      .attr('cy', center.y)
      .attr('r', radius)
      .attr('fill', 'none')
      .attr('stroke', '#444')
      .attr('stroke-width', 2);

    const signNames = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
    signNames.forEach((sign, index) => {
      const angle = (index * 30 - 90) * (Math.PI / 180);
      const x = center.x + Math.cos(angle) * (radius - 20);
      const y = center.y + Math.sin(angle) * (radius - 20);

      svg.append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('fill', '#222')
        .attr('font-size', 11)
        .attr('text-anchor', 'middle')
        .attr('alignment-baseline', 'middle')
        .text(sign);

      const lineX = center.x + Math.cos(angle) * radius;
      const lineY = center.y + Math.sin(angle) * radius;
      svg.append('line')
        .attr('x1', center.x)
        .attr('y1', center.y)
        .attr('x2', lineX)
        .attr('y2', lineY)
        .attr('stroke', '#777')
        .attr('stroke-width', 1);
    });

    planets.forEach((planet, index) => {
      const angle = (planet.longitude - 90) * (Math.PI / 180);
      const distance = radius * 0.7;
      const x = center.x + Math.cos(angle) * distance;
      const y = center.y + Math.sin(angle) * distance;

      svg.append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 10)
        .attr('fill', '#ffb84d')
        .attr('stroke', '#333')
        .attr('stroke-width', 1.5);

      svg.append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('fill', '#111')
        .attr('font-size', 10)
        .attr('text-anchor', 'middle')
        .attr('alignment-baseline', 'middle')
        .text(planet.name[0]);

      svg.append('text')
        .attr('x', x)
        .attr('y', y + 18)
        .attr('fill', '#111')
        .attr('font-size', 9)
        .attr('text-anchor', 'middle')
        .text(planet.sign);
    });
  }

  function clearError() {
    const errorElem = document.querySelector('#natalForm .errorMessage');
    if (errorElem) errorElem.textContent = '';
  }

  function showError(message) {
    const errorElem = document.querySelector('#natalForm .errorMessage');
    if (errorElem) errorElem.textContent = message;
  }

  function calculateNatalLegacy() {
    clearError();
    const day = parseFieldValue('natalDay');
    const month = document.getElementById('natalMonth')?.value || 'January';
    const year = parseFieldValue('natalYear');
    const hour = parseFieldValue('natalHour');
    const minute = parseFieldValue('natalMinute');
    const location = document.getElementById('natalLocation')?.value || '';

    if (!day || !month || !year) {
      showError('Enter date, month and year.');
      return;
    }

    if (!window.Astronomy || !window.d3) {
      showError('Astronomy or D3 not loaded.');
      return;
    }

    const formData = {
      name: document.getElementById('natalName')?.value || 'Chart',
      day,
      month,
      year,
      hour,
      minute,
      location,
      latitude: 0,
      longitude: 0
    };

    try {
      const planets = calculatePositions(formData);
      drawWheel(planets);
      showError('');
    } catch (err) {
      console.error('Legacy natal calc error', err);
      showError('Erro no cálculo. Use um servidor local ou verifique a data.');
    }
  }

  window.calculateNatalLegacy = calculateNatalLegacy;
  window.calculateNatal = calculateNatalLegacy;
})();
