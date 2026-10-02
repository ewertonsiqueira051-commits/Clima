const API = 'https://api.open-meteo.com/v1/forecast';
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';

const state = {
  map: null,
  marker: null,
  weather: null
};

const $ = (id) => document.getElementById(id);

const fmt = (n, digits = 0) =>
  n == null || Number.isNaN(Number(n))
    ? '--'
    : Number(n).toFixed(digits);

const weatherText = {
  0: 'Céu limpo',
  1: 'Predominantemente limpo',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Névoa',
  48: 'Névoa congelante',
  51: 'Garoa fraca',
  53: 'Garoa',
  55: 'Garoa forte',
  61: 'Chuva fraca',
  63: 'Chuva moderada',
  65: 'Chuva forte',
  71: 'Neve fraca',
  73: 'Neve',
  75: 'Neve forte',
  80: 'Pancadas fracas',
  81: 'Pancadas moderadas',
  82: 'Pancadas fortes',
  95: 'Trovoada',
  96: 'Trovoada com granizo',
  99: 'Trovoada forte com granizo'
};

const icons = {
  0: '☀',
  1: '🌤',
  2: '⛅',
  3: '☁',
  45: '〰',
  48: '〰',
  51: '☂',
  53: '☂',
  55: '☂',
  61: '🌧',
  63: '🌧',
  65: '🌧',
  71: '❄',
  73: '❄',
  75: '❄',
  80: '🌦',
  81: '🌦',
  82: '🌧',
  95: '⛈',
  96: '⛈',
  99: '⛈'
};

function setText(id, value) {
  $(id).textContent = value;
}

function localDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  });
}

function riskAnalysis(h, i) {
  const cape = Number(h.cape[i] || 0);
  const inhibition = Number(h.convective_inhibition[i] || 0);
  const gust = Number(h.wind_gusts_10m[i] || 0);
  const rain = Number(h.precipitation[i] || 0);
  const lift = Number(h.lifted_index[i] || 0);
  const cloud = Number(h.cloud_cover[i] || 0);

  const score = Math.min(
    100,
    Math.round(
      (Math.min(cape, 3000) / 3000) * 42 +
      (Math.min(gust, 100) / 100) * 23 +
      (Math.min(rain, 18) / 18) * 15 +
      (Math.max(0, -lift) / 8) * 12 +
      (cloud / 100) * 8
    )
  );

  const level =
    score >= 65
      ? [
          'high',
          'Atenção elevada',
          'Há sinais combinados de instabilidade e vento. Consulte fontes oficiais.'
        ]
      : score >= 38
      ? [
          'medium',
          'Atenção moderada',
          'Condições podem favorecer pancadas e trovoadas isoladas.'
        ]
      : [
          'low',
          'Ambiente pouco favorável',
          'Sinais fracos de convecção severa neste horário.'
        ];

  setText('risk-score', score);
  setText('risk-title', level[1]);
  setText('risk-text', level[2]);

  $('risk-badge').className = `badge ${level[0]}`;

  setText(
    'risk-badge',
    level[0] === 'high'
      ? 'atenção'
      : level[0] === 'medium'
      ? 'monitorar'
      : 'baixo'
  );

  $('risk-bar').style.width = `${score}%`;

  return {
    score,
    cape,
    inhibition,
    gust,
    rain,
    cloud
  };
}

function renderHourly(data) {
  const h = data.hourly;
  const now = new Date();

  let start = h.time.findIndex(
    (time) => new Date(time) >= now
  );

  if (start < 0) {
    start = 0;
  }

  start = Math.min(start, h.time.length - 8);

  $('hourly').innerHTML = Array.from(
    { length: 8 },
    (_, x) => {
      const i = start + x;
      const date = new Date(h.time[i]);
      const code = h.weather_code[i];

      return `
        <div class="hour">
          <div class="hour-time">
            ${
              x === 0
                ? 'Agora'
                : date.toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })
            }
          </div>

          <div class="hour-icon">
            ${icons[code] || '·'}
          </div>

          <div class="hour-temp">
            ${fmt(h.temperature_2m[i])}°
          </div>

          <div class="hour-rain">
            ${fmt(h.precipitation_probability[i])}% chuva
          </div>
        </div>
      `;
    }
  ).join('');

  $('forecast-date').textContent = localDate(h.time[start]);

  riskAnalysis(h, start);
  renderClouds(h, start);
}

function renderClouds(h, i) {
  const low = Number(h.cloud_cover_low[i] || 0);
  const mid = Number(h.cloud_cover_mid[i] || 0);
  const high = Number(h.cloud_cover_high[i] || 0);
  const total = Number(h.cloud_cover[i] || 0);

  [
    ['low', low],
    ['mid', mid],
    ['high', high]
  ].forEach(([key, value]) => {
    setText(`cloud-${key}-value`, `${fmt(value)}%`);
    $(`cloud-${key}`).style.width = `${value}%`;
  });

  setText('cloud-total', `${fmt(total)}%`);

  let reading;

  if (total > 80) {
    reading =
      'Céu bastante fechado. Se a camada baixa estiver alta, a visibilidade e a chance de chuva aumentam.';
  } else if (low > 60) {
    reading =
      'Nuvens baixas predominam: observe evolução de pancadas e mudanças rápidas de visibilidade.';
  } else if (high > 60) {
    reading =
      'Predominam nuvens altas, geralmente associadas a mudança de tempo quando avançam sobre a região.';
  } else {
    reading =
      'Cobertura parcial, com abertura entre as camadas. Acompanhe a evolução nas próximas horas.';
  }

  setText('cloud-reading', reading);
}

function render(data, place) {
  const current = data.current;

  setText(
    'place-name',
    `${place.name}${place.admin1 ? ', ' + place.admin1 : ''}`
  );

  setText('current-temp', `${fmt(current.temperature_2m)}°`);

  setText(
    'current-condition',
    weatherText[current.weather_code] || 'Condição variável'
  );

  setText(
    'feels-like',
    `${fmt(current.apparent_temperature)}°C`
  );

  setText(
    'humidity',
    `${fmt(current.relative_humidity_2m)}%`
  );

  setText(
    'wind',
    `${fmt(current.wind_speed_10m)} km/h`
  );

  setText(
    'gust',
    `${fmt(current.wind_gusts_10m)} km/h`
  );

  setText(
    'pressure',
    `${fmt(current.pressure_msl)} hPa`
  );

  $('weather-icon').textContent =
    icons[current.weather_code] || '☁';

  setText(
    'coordinates',
    `${fmt(place.latitude, 4)}°, ${fmt(place.longitude, 4)}° · ${
      place.country || 'Brasil'
    }`
  );

  $('last-update').textContent =
    `Atualizado ${new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    })}`;

  renderHourly(data);
  updateMap(place.latitude, place.longitude, place.name);
}

async function findPlace(query) {
  const response = await fetch(
    `${GEO}?name=${encodeURIComponent(
      query
    )}&count=1&language=pt&format=json`
  );

  if (!response.ok) {
    throw new Error('Falha na busca da cidade.');
  }

  const json = await response.json();

  if (!json.results || !json.results.length) {
    throw new Error('Cidade não encontrada.');
  }

  return json.results[0];
}

async function load(query) {
  $('search-status').textContent =
    'Consultando dados…';

  try {
    const isCoordinates =
      /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(
        query
      );

    const [latitude, longitude] = isCoordinates
      ? query.split(',').map(Number)
      : [null, null];

    const place = isCoordinates
      ? {
          latitude,
          longitude,
          name: 'Minha localização',
          admin1: 'Brasil',
          country: 'Brasil'
        }
      : await findPlace(query);

    const params = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,

      current:
        'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_gusts_10m',

      hourly:
        'temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_gusts_10m,cape,convective_inhibition,lifted_index',

      forecast_days: '3',
      timezone: 'America/Sao_Paulo'
    });

    const response = await fetch(`${API}?${params}`);
    const raw = await response.text();

    let responseData;

    try {
      responseData = JSON.parse(raw);
    } catch {
      responseData = null;
    }

    if (!response.ok) {
      throw new Error(
        responseData?.reason ||
          `Falha no serviço meteorológico (${response.status}).`
      );
    }

    const data = responseData;

    if (!data?.current || !data?.hourly) {
      throw new Error(
        'A API não retornou os dados meteorológicos esperados.'
      );
    }

    state.weather = data;

    render(data, place);

    $('search-status').textContent = '';
  } catch (error) {
    $('search-status').textContent =
      error.message ||
      'Não foi possível consultar o tempo.';
  }
}

function updateMap(latitude, longitude, name) {
  if (!state.map) {
    state.map = L.map('map', {
      zoomControl: false
    }).setView([latitude, longitude], 8);

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '© OpenStreetMap'
      }
    ).addTo(state.map);

    state.marker = L.marker([
      latitude,
      longitude
    ]).addTo(state.map);
  } else {
    state.map.setView([latitude, longitude], 8);
    state.marker.setLatLng([latitude, longitude]);
  }

  state.marker.bindPopup(name).openPopup();
}

document
  .getElementById('search-form')
  .addEventListener('submit', (event) => {
    event.preventDefault();

    const query = $('location-input').value.trim();

    if (query) {
      load(query);
    }
  });

document
  .getElementById('locate-btn')
  .addEventListener('click', () => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        load(
          `${position.coords.latitude},${position.coords.longitude}`
        );
      },
      () => {
        $('search-status').textContent =
          'Não foi possível obter sua localização.';
      }
    );
  });

load('Curitiba, Paraná');
