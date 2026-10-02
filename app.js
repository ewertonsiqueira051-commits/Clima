(() => {
  'use strict';

  const VERSION = '3.0';
  const API = 'https://api.open-meteo.com/v1/forecast';
  const GEO = 'https://geocoding-api.open-meteo.com/v1/search';

  const $ = (id) => document.getElementById(id);

  const state = {
    map: null,
    marker: null,
    request: 0,
    query: 'Curitiba, PR',
    busy: false
  };

  const descriptions = {
    0: 'Céu limpo',
    1: 'Predominantemente limpo',
    2: 'Parcialmente nublado',
    3: 'Nublado',
    45: 'Nevoeiro',
    48: 'Nevoeiro com geada',
    51: 'Garoa fraca',
    53: 'Garoa moderada',
    55: 'Garoa forte',
    56: 'Garoa congelante',
    57: 'Garoa congelante forte',
    61: 'Chuva fraca',
    63: 'Chuva moderada',
    65: 'Chuva forte',
    66: 'Chuva congelante',
    67: 'Chuva congelante forte',
    71: 'Neve fraca',
    73: 'Neve moderada',
    75: 'Neve forte',
    77: 'Grãos de neve',
    80: 'Pancadas fracas',
    81: 'Pancadas moderadas',
    82: 'Pancadas fortes',
    85: 'Pancadas de neve',
    86: 'Pancadas fortes de neve',
    95: 'Trovoadas',
    96: 'Trovoadas com granizo',
    99: 'Trovoadas com granizo forte'
  };

  function text(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  function numeric(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function fmt(value, digits = 0) {
    return numeric(value) ? value.toFixed(digits) : '—';
  }

  function valueAt(hourly, key, index) {
    return hourly[key]?.[index] ?? null;
  }

  function icon(code) {
    if (!numeric(code)) return '·';
    if (code === 0) return '☀';
    if (code <= 2) return '⛅';
    if (code === 3) return '☁';
    if (code <= 48) return '🌫';
    if (code >= 95) return '⛈';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄';
    return '🌧';
  }

  function dateLabel(seconds, timezone, options) {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      ...options
    }).format(new Date(seconds * 1000));
  }

  async function getJSON(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        signal: controller.signal
      });

      const raw = await response.text();
      let data;

      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          `Resposta inválida do serviço (HTTP ${response.status}).`
        );
      }

      if (!response.ok || data.error) {
        throw new Error(
          `HTTP ${response.status}: ${data.reason || 'Consulta recusada.'}`
        );
      }

      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(
          'O serviço demorou mais de 20 segundos. Tente novamente.'
        );
      }

      if (error instanceof TypeError) {
        throw new Error(
          'Não foi possível conectar ao serviço. Verifique a internet ou bloqueadores do navegador.'
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  const normalize = (value) =>
    String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  async function findPlace(query) {
    const coordinateMatch = query.match(
      /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/
    );

    if (coordinateMatch) {
      const latitude = Number(coordinateMatch[1]);
      const longitude = Number(coordinateMatch[2]);

      if (
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180
      ) {
        throw new Error('Latitude ou longitude inválida.');
      }

      return {
        name: 'Coordenadas consultadas',
        latitude,
        longitude
      };
    }

    const parts = query.split(',').map((part) => part.trim());
    const city = parts[0];
    const region = normalize(parts[1] || '');

    if (!city) throw new Error('Digite uma cidade.');

    // Curitiba funciona sem depender da busca por nomes.
    if (
      normalize(city) === 'curitiba' &&
      ['', 'pr', 'parana'].includes(region)
    ) {
      return {
        name: 'Curitiba',
        admin1: 'Paraná',
        latitude: -25.4297,
        longitude: -49.2719
      };
    }

    const params = new URLSearchParams({
      name: city,
      count: '100',
      language: 'pt',
      format: 'json',
      countryCode: 'BR'
    });

    const data = await getJSON(`${GEO}?${params}`);

    let candidates = (data.results || []).filter(
      (place) => place.country_code === 'BR'
    );

    if (region) {
      const states = {
        ac: 'acre', al: 'alagoas', ap: 'amapa',
        am: 'amazonas', ba: 'bahia', ce: 'ceara',
        df: 'distrito federal', es: 'espirito santo',
        go: 'goias', ma: 'maranhao', mt: 'mato grosso',
        ms: 'mato grosso do sul', mg: 'minas gerais',
        pa: 'para', pb: 'paraiba', pr: 'parana',
        pe: 'pernambuco', pi: 'piaui', rj: 'rio de janeiro',
        rn: 'rio grande do norte', rs: 'rio grande do sul',
        ro: 'rondonia', rr: 'roraima', sc: 'santa catarina',
        sp: 'sao paulo', se: 'sergipe', to: 'tocantins'
      };

      const wanted = states[region] || region;

      candidates = candidates.filter(
        (place) => normalize(place.admin1) === wanted
      );
    }

    if (!candidates.length) {
      throw new Error(
        'Cidade não encontrada no Brasil. Exemplo: Londrina, PR.'
      );
    }

    const exact = candidates.filter(
      (place) => normalize(place.name) === normalize(city)
    );

    if (exact.length) candidates = exact;

    if (candidates.length > 1) {
      throw new Error(
        'Há mais de uma cidade com esse nome. Informe também o estado.'
      );
    }

    return candidates[0];
  }

  function updateMap(place) {
    text(
      'coordinates',
      `${fmt(place.latitude, 4)}°, ${fmt(place.longitude, 4)}°`
    );

    if (!window.L) {
      text('map', 'Mapa indisponível: a biblioteca não carregou.');
      return;
    }

    try {
      if (!state.map) {
        $('map').textContent = '';

        state.map = L.map('map').setView(
          [place.latitude, place.longitude], 8
        );

        L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
          }
        ).addTo(state.map);

        state.marker = L.marker([
          place.latitude, place.longitude
        ]).addTo(state.map);
      } else {
        state.map.setView([place.latitude, place.longitude], 8);
        state.marker.setLatLng([place.latitude, place.longitude]);
      }

      const label = document.createElement('span');
      label.textContent = place.name;
      state.marker.bindPopup(label);
      state.map.invalidateSize();
    } catch (error) {
      text('coordinates', `Mapa indisponível: ${error.message}`);
    }
  }

  function resetPanel() {
    const fields = [
      'current-temp', 'feels-like', 'humidity',
      'wind', 'gust', 'pressure', 'cloud-total',
      'cloud-low-value', 'cloud-mid-value', 'cloud-high-value'
    ];

    fields.forEach((id) => text(id, '—'));
    text('current-condition', 'Consultando…');
    text('weather-icon', '☁');
    text('forecast-date', '—');
    text('cloud-reading', 'Aguardando previsão de nuvens.');
    $('hourly').replaceChildren();

    ['cloud-low', 'cloud-mid', 'cloud-high', 'risk-bar']
      .forEach((id) => {
        if ($(id)) $(id).style.width = '0%';
      });

    // O índice anterior não foi validado meteorologicamente.
    // Não apresentamos uma pontuação de risco sem essa validação.
    text('risk-score', '—');
    text('risk-badge', 'sem estimativa');
    $('risk-badge').className = 'badge neutral';
    text('risk-title', 'Tornados: sem estimativa');
    text(
      'risk-text',
      'Esta consulta não calcula probabilidade de tornado. Consulte alertas oficiais.'
    );

    const scale = document.querySelector('.score-ring small');
    if (scale) scale.textContent = '';

    const disclaimer = document.querySelector('.disclaimer');
    if (disclaimer) {
      disclaimer.textContent =
        'Previsão numérica não confirma rotação, granizo ou ocorrência de tornado.';
    }
  }

  function renderClouds(hourly, index) {
    const total = valueAt(hourly, 'cloud_cover', index);

    text('cloud-total', `${fmt(total)}%`);

    for (const key of ['low', 'mid', 'high']) {
      const value = valueAt(hourly, `cloud_cover_${key}`, index);
      text(`cloud-${key}-value`, `${fmt(value)}%`);
      $(`cloud-${key}`).style.width =
        `${numeric(value) ? Math.max(0, Math.min(100, value)) : 0}%`;
    }

    text(
      'cloud-reading',
      numeric(total)
        ? `Cobertura total prevista: ${fmt(total)}%. As camadas podem se sobrepor e não devem ser somadas. Cobertura de nuvens, sozinha, não determina chuva ou tornado.`
        : 'Cobertura de nuvens indisponível neste horário.'
    );
  }

  function render(data) {
    const current = data.current;
    const hourly = data.hourly;
    const timezone = data.timezone || 'America/Sao_Paulo';

    text('current-temp', `${fmt(current.temperature_2m)}°`);
    text(
      'current-condition',
      descriptions[current.weather_code] || 'Condição indisponível'
    );
    text('weather-icon', icon(current.weather_code));
    text('feels-like', `${fmt(current.apparent_temperature)}°C`);
    text('humidity', `${fmt(current.relative_humidity_2m)}%`);
    text('wind', `${fmt(current.wind_speed_10m)} km/h`);
    text('gust', `${fmt(current.wind_gusts_10m)} km/h`);
    text('pressure', `${fmt(current.pressure_msl)} hPa`);

    const now = Date.now() / 1000;
    let index = hourly.time.findIndex((time) => time > now);
    index = index === -1
      ? hourly.time.length - 1
      : Math.max(0, index - 1);

    const fragment = document.createDocumentFragment();

    for (
      let i = index;
      i < Math.min(index + 8, hourly.time.length);
      i++
    ) {
      const card = document.createElement('div');
      card.className = 'hour';

      const items = [
        [
          'hour-time',
          dateLabel(hourly.time[i], timezone, {
            hour: '2-digit', minute: '2-digit'
          })
        ],
        ['hour-icon', icon(valueAt(hourly, 'weather_code', i))],
        ['hour-temp', `${fmt(valueAt(hourly, 'temperature_2m', i))}°`],
        [
          'hour-rain',
          `${fmt(valueAt(hourly, 'precipitation_probability', i))}% chuva`
        ]
      ];

      for (const [className, content] of items) {
        const element = document.createElement('div');
        element.className = className;
        element.textContent = content;
        card.appendChild(element);
      }

      fragment.appendChild(card);
    }

    $('hourly').replaceChildren(fragment);

    text(
      'forecast-date',
      dateLabel(hourly.time[index], timezone, {
        day: '2-digit', month: 'long'
      }) + ` · ${timezone}`
    );

    renderClouds(hourly, index);

    text(
      'last-update',
      `v${VERSION} · dados de ${dateLabel(current.time, timezone, {
        hour: '2-digit', minute: '2-digit'
      })}`
    );
  }

  async function load(query) {
    const request = ++state.request;
    state.busy = true;
    state.query = query;

    resetPanel();
    text('place-name', query);
    text('last-update', `v${VERSION} · consultando…`);
    text('search-status', `v${VERSION} · buscando localização…`);

    try {
      const place = await findPlace(query);
      if (request !== state.request) return;

      text(
        'place-name',
        `${place.name}${place.admin1 ? ', ' + place.admin1 : ''}`
      );

      updateMap(place);

      text('search-status', `v${VERSION} · consultando previsão…`);

      const params = new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current: [
          'temperature_2m',
          'relative_humidity_2m',
          'apparent_temperature',
          'weather_code',
          'pressure_msl',
          'wind_speed_10m',
          'wind_gusts_10m'
        ].join(','),
        hourly: [
          'temperature_2m',
          'precipitation_probability',
          'weather_code',
          'cloud_cover',
          'cloud_cover_low',
          'cloud_cover_mid',
          'cloud_cover_high'
        ].join(','),
        forecast_days: '3',
        timezone: 'auto',
        timeformat: 'unixtime',
        temperature_unit: 'celsius',
        wind_speed_unit: 'kmh',
        precipitation_unit: 'mm'
      });

      const data = await getJSON(`${API}?${params}`);
      if (request !== state.request) return;

      if (
        !data.current ||
        !numeric(data.current.time) ||
        !Array.isArray(data.hourly?.time) ||
        data.hourly.time.length === 0
      ) {
        throw new Error('O serviço retornou dados incompletos.');
      }

      render(data);
      text('search-status', '');
    } catch (error) {
      if (request !== state.request) return;

      text('search-status', `v${VERSION} · ${error.message}`);
      text('last-update', `v${VERSION} · consulta falhou`);
      text('current-condition', 'Dados indisponíveis');
      text('cloud-reading', 'Sem dados nesta consulta.');
    } finally {
      if (request === state.request) state.busy = false;
    }
  }

  function start() {
    const brand = document.querySelector('.brand');
    if (brand) {
      brand.style.color = 'inherit';
      brand.style.textDecoration = 'none';
    }

    const temp = $('current-temp');
    if (temp) {
      temp.style.whiteSpace = 'nowrap';
      temp.style.flexShrink = '0';
    }

    $('search-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const query = $('location-input').value.trim();
      if (query) load(query);
      else text('search-status', 'Digite uma cidade ou coordenadas.');
    });

    $('locate-btn').addEventListener('click', () => {
      if (!navigator.geolocation) {
        text('search-status', 'Este navegador não oferece localização.');
        return;
      }

      text('search-status', 'Obtendo localização…');

      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const query = `${coords.latitude},${coords.longitude}`;
          $('location-input').value = query;
          load(query);
        },
        () => text(
          'search-status',
          'Localização indisponível. Digite a cidade manualmente.'
        ),
        { timeout: 15000, maximumAge: 300000 }
      );
    });

    load(state.query);

    setInterval(() => {
      if (!document.hidden && !state.busy) load(state.query);
    }, 15 * 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();