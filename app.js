const storageKey = 'football-pick-tracker';

const state = {
  games: [],
  editingGameId: null,
  editingPrediction: null,
  filterText: '',
};

const MARKET_LABELS = [
  {
    labels: ['spread', 'against the spread', 'ats', 'point spread'],
    value: 'Spread',
    icon: '📏',
    description: 'Against the spread selections',
  },
  { labels: ['moneyline', 'money line', 'ml'], value: 'Moneyline', icon: '💰', description: 'Straight-up winners' },
  {
    labels: ['total', 'over/under', 'o/u', 'ou', 'over under'],
    value: 'Total',
    icon: '📊',
    description: 'Game totals and tempo reads',
  },
  { labels: ['player prop', 'props', 'prop'], value: 'Player Prop', icon: '🎯', description: 'Individual player markets' },
  { labels: ['team total'], value: 'Team Total', icon: '🏟️', description: 'Team scoring outlooks' },
];

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

const selectors = {
  gamesContainer: document.getElementById('gamesContainer'),
  snapshot: document.getElementById('snapshot'),
  searchInput: document.getElementById('searchInput'),
  addGameBtn: document.getElementById('addGameBtn'),
  sampleDataBtn: document.getElementById('sampleDataBtn'),
  exportDataBtn: document.getElementById('exportDataBtn'),
  importDataBtn: document.getElementById('importDataBtn'),
  importFileInput: document.getElementById('importFileInput'),
  emptyTemplate: document.getElementById('emptyStateTemplate'),
};

function formatMarketLabel(input) {
  if (!input) return 'General Picks';
  const raw = String(input).trim();
  if (!raw) return 'General Picks';
  const normalized = raw.toLowerCase();
  for (const label of MARKET_LABELS) {
    if (label.labels.includes(normalized)) {
      return label.value;
    }
  }
  return raw;
}

function getMarketMeta(label) {
  const normalized = formatMarketLabel(label);
  if (!label || normalized === 'General Picks') {
    return { icon: '🧠', description: 'Mixed markets or unspecified angles' };
  }
  const preset = MARKET_LABELS.find((item) => item.value === normalized);
  if (preset) {
    return { icon: preset.icon, description: preset.description };
  }
  return { icon: '📌', description: '' };
}

const dialogs = {
  game: document.getElementById('gameDialog'),
  prediction: document.getElementById('predictionDialog'),
};

const forms = {
  game: document.getElementById('gameForm'),
  prediction: document.getElementById('predictionForm'),
};

const outputs = {
  confidence: dialogs.prediction.querySelector('[data-confidence-output]'),
};

const texts = {
  gameDialogTitle: document.getElementById('gameDialogTitle'),
  predictionDialogTitle: document.getElementById('predictionDialogTitle'),
};

document.addEventListener('DOMContentLoaded', () => {
  hydrate();
  bindEvents();
  render();
});

function hydrate() {
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.games)) {
        state.games = normalizeGames(parsed.games);
        return;
      }
    } catch (error) {
      console.warn('Unable to parse stored data, falling back to sample slate.', error);
    }
  }
  state.games = sampleSlate();
}

function bindEvents() {
  selectors.addGameBtn.addEventListener('click', () => openGameDialog());
  selectors.sampleDataBtn.addEventListener('click', () => {
    if (confirm('Replace your current board with the curated sample slate?')) {
      state.games = sampleSlate();
      persist();
      render();
    }
  });
  selectors.exportDataBtn.addEventListener('click', exportData);
  selectors.importDataBtn.addEventListener('click', () => selectors.importFileInput.click());
  selectors.importFileInput.addEventListener('change', handleImportFile);

  selectors.searchInput.addEventListener('input', (event) => {
    state.filterText = event.target.value.trim().toLowerCase();
    renderGames();
  });

  forms.game.addEventListener('submit', handleGameSubmit);
  forms.prediction.addEventListener('submit', handlePredictionSubmit);

  dialogs.game.addEventListener('click', handleDialogClick);
  dialogs.prediction.addEventListener('click', handleDialogClick);

  dialogs.game.addEventListener('close', () => {
    state.editingGameId = null;
    forms.game.reset();
  });
  dialogs.prediction.addEventListener('close', () => {
    state.editingPrediction = null;
    forms.prediction.reset();
    forms.prediction.confidence.value = 50;
    outputs.confidence.textContent = '50%';
  });

  outputs.confidence.textContent = `${forms.prediction.confidence.value}%`;
  forms.prediction.confidence.addEventListener('input', (event) => {
    outputs.confidence.textContent = `${event.target.value}%`;
  });

  selectors.gamesContainer.addEventListener('click', handleGameAction);
}

function persist() {
  localStorage.setItem(storageKey, JSON.stringify({ games: state.games }));
}

function render() {
  renderGames();
  renderSnapshot();
}

function renderGames() {
  const container = selectors.gamesContainer;
  container.innerHTML = '';

  const games = state.games.filter((game) => filterGame(game, state.filterText));

  if (!games.length) {
    const empty = selectors.emptyTemplate.content.cloneNode(true);
    empty.querySelector('[data-empty-add]').addEventListener('click', () => openGameDialog());
    container.appendChild(empty);
    return;
  }

  games.forEach((game) => {
    container.appendChild(renderGameCard(game));
  });
}

function filterGame(game, needle) {
  if (!needle) return true;
  const haystack = [
    game.homeTeam,
    game.awayTeam,
    game.location,
    game.kickoff,
    ...(game.tags || []),
    game.notes,
    ...game.predictions.flatMap((prediction) => [
      prediction.source,
      prediction.market,
      prediction.pick,
      prediction.notes,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

function renderGameCard(game) {
  const card = document.createElement('article');
  card.className = 'game-card';
  card.dataset.gameId = game.id;

  const header = document.createElement('header');
  header.className = 'game-header';

  const topRow = document.createElement('div');
  topRow.className = 'game-header__top';

  const title = document.createElement('h2');
  title.className = 'game-title';
  title.textContent = `${game.awayTeam} @ ${game.homeTeam}`;
  topRow.appendChild(title);

  if (game.tags?.length) {
    game.tags.slice(0, 4).forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = tag.trim();
      topRow.appendChild(chip);
    });
  }

  header.appendChild(topRow);

  const meta = document.createElement('div');
  meta.className = 'game-meta';
  if (game.kickoff) {
    const kickoff = document.createElement('span');
    kickoff.textContent = `Kickoff: ${game.kickoff}`;
    meta.appendChild(kickoff);
  }
  if (game.location) {
    const location = document.createElement('span');
    location.textContent = game.location;
    meta.appendChild(location);
  }

  const summary = buildConsensusSummary(game.predictions);
  if (summary) {
    const banner = document.createElement('div');
    banner.className = 'summary-banner';
    banner.innerHTML = `<strong>${summary.pick}</strong><span>${summary.count} of ${summary.total} sources (${summary.percent}%)`;
    header.appendChild(banner);
  }

  header.appendChild(meta);

  if (game.notes) {
    const notes = document.createElement('p');
    notes.className = 'game-notes';
    notes.textContent = game.notes;
    notes.style.color = 'var(--text-muted)';
    notes.style.fontSize = '0.9rem';
    notes.style.lineHeight = '1.5';
    header.appendChild(notes);
  }

  const actions = document.createElement('div');
  actions.className = 'game-actions';
  actions.innerHTML = `
    <button class="btn" data-action="edit-game">✏️ Edit</button>
    <button class="btn btn--ghost" data-action="add-prediction">➕ Add Pick</button>
    <button class="btn btn--ghost" data-action="delete-game">🗑️ Delete</button>
  `;

  header.appendChild(actions);
  card.appendChild(header);

  const markets = groupBy(game.predictions, (prediction) => formatMarketLabel(prediction.market));
  if (markets.size) {
    markets.forEach((predictions, market) => {
      card.appendChild(renderMarketBlock(game, market, predictions));
    });
  } else {
    const emptyMarket = document.createElement('div');
    emptyMarket.className = 'market-block';
    emptyMarket.innerHTML = `
      <div class="market-header">
        <div class="market-title">
          <h3>Start building your board</h3>
        </div>
        <p class="market-meta">No picks yet. Add insights from your favorite experts.</p>
      </div>
      <button class="btn btn--primary" data-action="add-prediction">Add first pick</button>
    `;
    card.appendChild(emptyMarket);
  }

  return card;
}

function renderMarketBlock(game, market, predictions) {
  const block = document.createElement('section');
  block.className = 'market-block';
  block.dataset.market = market;

  const header = document.createElement('div');
  header.className = 'market-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'market-title';

  const title = document.createElement('h3');
  const meta = getMarketMeta(market);
  const icon = document.createElement('span');
  icon.className = 'market-icon';
  icon.textContent = meta.icon;
  title.appendChild(icon);
  const titleText = document.createElement('span');
  titleText.textContent = market;
  title.appendChild(titleText);
  titleRow.appendChild(title);

  const metaText = document.createElement('span');
  metaText.className = 'market-meta';
  metaText.textContent = `${predictions.length} pick${predictions.length === 1 ? '' : 's'}`;
  titleRow.appendChild(metaText);

  header.appendChild(titleRow);

  if (meta.description) {
    const subtitle = document.createElement('p');
    subtitle.className = 'market-subtitle';
    subtitle.textContent = meta.description;
    header.appendChild(subtitle);
  }

  header.appendChild(buildSummaryBar(predictions));

  const list = document.createElement('ul');
  list.className = 'prediction-list';

  const sorted = [...predictions].sort((a, b) => {
    const left = typeof a.confidence === 'number' ? a.confidence : -1;
    const right = typeof b.confidence === 'number' ? b.confidence : -1;
    return right - left;
  });

  sorted.forEach((prediction) => {
    list.appendChild(renderPredictionItem(game, prediction));
  });

  block.appendChild(header);
  block.appendChild(list);

  return block;
}

function renderPredictionItem(game, prediction) {
  const item = document.createElement('li');
  item.className = 'prediction';
  item.dataset.predictionId = prediction.id;
  item.dataset.gameId = game.id;

  const source = document.createElement('div');
  source.className = 'prediction__source';
  source.textContent = prediction.source;

  const pick = document.createElement('div');
  pick.className = 'prediction__pick';
  const pill = document.createElement('span');
  pill.className = 'pick-pill';
  pill.style.background = colorForString(prediction.pick, 0.16);
  pill.style.borderColor = colorForString(prediction.pick, 0.35);
  pill.textContent = prediction.pick;
  pick.appendChild(pill);
  if (prediction.market) {
    const label = formatMarketLabel(prediction.market);
    const meta = getMarketMeta(prediction.market);
    const marketTag = document.createElement('span');
    marketTag.className = 'market-pill';
    marketTag.textContent = `${meta.icon} ${label}`;
    pick.appendChild(marketTag);
  }

  const line = document.createElement('div');
  line.className = 'prediction__line';
  line.textContent = prediction.line || '';

  const confidence = document.createElement('div');
  confidence.className = 'prediction__confidence';
  if (Number.isFinite(prediction.confidence)) {
    const meter = document.createElement('div');
    meter.className = 'confidence-meter';
    meter.style.setProperty('--confidence', `${prediction.confidence}%`);
    const label = document.createElement('div');
    label.className = 'confidence-label';
    label.textContent = `${prediction.confidence}% confidence`;
    confidence.appendChild(meter);
    confidence.appendChild(label);
  }

  const notes = document.createElement('div');
  notes.className = 'prediction__notes';
  if (prediction.notes) {
    const noteSpan = document.createElement('span');
    noteSpan.textContent = prediction.notes;
    notes.appendChild(noteSpan);
  }
  if (prediction.link) {
    if (notes.childNodes.length) {
      const separator = document.createElement('span');
      separator.textContent = ' · ';
      notes.appendChild(separator);
    }
    const anchor = document.createElement('a');
    anchor.href = prediction.link;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = 'Source';
    notes.appendChild(anchor);
  }
  if (!notes.childNodes.length) {
    notes.textContent = '—';
    notes.style.color = 'rgba(248, 250, 252, 0.35)';
  }

  const actions = document.createElement('div');
  actions.className = 'prediction__actions';
  actions.innerHTML = `
    <button class="icon-btn" title="Edit" data-action="edit-prediction">✏️</button>
    <button class="icon-btn" title="Delete" data-action="delete-prediction">🗑️</button>
  `;

  item.appendChild(source);
  item.appendChild(pick);
  item.appendChild(line);
  item.appendChild(confidence);
  item.appendChild(notes);
  item.appendChild(actions);

  return item;
}

function buildSummaryBar(predictions) {
  const counts = groupBy(predictions, (prediction) => prediction.pick || 'Other');
  const bar = document.createElement('div');
  bar.className = 'summary-bar';

  const entries = [...counts.entries()].sort((a, b) => b[1].length - a[1].length);
  entries.forEach(([key, value]) => {
    const segment = document.createElement('div');
    segment.className = 'summary-segment';
    segment.style.flex = value.length;
    segment.style.background = colorForString(key, 0.22);
    segment.textContent = `${key} (${value.length})`;
    bar.appendChild(segment);
  });

  if (!bar.children.length) {
    bar.style.justifyContent = 'center';
    bar.style.padding = '0.5rem';
    bar.textContent = 'No picks logged';
  }

  return bar;
}

function buildConsensusSummary(predictions) {
  if (!predictions.length) return null;
  const counts = new Map();
  for (const prediction of predictions) {
    const key = (prediction.pick || 'Other').trim();
    if (!counts.has(key)) counts.set(key, 0);
    counts.set(key, counts.get(key) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [pick, count] = sorted[0];
  const total = predictions.length;
  const percent = Math.round((count / total) * 100);
  if (percent < 40) return null;
  return { pick, count, total, percent };
}

function handleGameSubmit(event) {
  event.preventDefault();
  const formData = new FormData(forms.game);

  const payload = {
    id: state.editingGameId ?? generateId(),
    homeTeam: formData.get('homeTeam').trim(),
    awayTeam: formData.get('awayTeam').trim(),
    kickoff: formData.get('kickoff').trim(),
    location: formData.get('location').trim(),
    tags: formData
      .get('tags')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    notes: formData.get('notes').trim(),
  };

  if (!payload.homeTeam || !payload.awayTeam) {
    alert('Home and away teams are required.');
    return;
  }

  const existingIndex = state.games.findIndex((game) => game.id === payload.id);
  if (existingIndex >= 0) {
    const existingPredictions = state.games[existingIndex].predictions || [];
    state.games[existingIndex] = { ...payload, predictions: existingPredictions };
  } else {
    state.games.push({ ...payload, predictions: [] });
  }

  state.editingGameId = null;
  persist();
  render();
  closeDialog(dialogs.game);
}

function handlePredictionSubmit(event) {
  event.preventDefault();
  const formData = new FormData(forms.prediction);
  if (!state.editingPrediction?.gameId) {
    alert('Please select a game before saving a prediction.');
    return;
  }
  const payload = {
    id: state.editingPrediction?.id ?? generateId(),
    source: (formData.get('source') || '').trim(),
    market: (formData.get('market') || '').trim(),
    pick: (formData.get('pick') || '').trim(),
    line: (formData.get('line') || '').trim(),
    confidence: (() => {
      const value = formData.get('confidence');
      if (value === null || value === undefined || value === '') return undefined;
      const numeric = Number(value);
      return Number.isNaN(numeric) ? undefined : numeric;
    })(),
    notes: (formData.get('notes') || '').trim(),
    link: (formData.get('link') || '').trim(),
  };

  if (!payload.source || !payload.pick) {
    alert('Source and pick are required.');
    return;
  }

  const game = state.games.find((g) => g.id === state.editingPrediction.gameId);
  if (!game) {
    console.error('Could not locate game for prediction.');
    return;
  }

  const existingIndex = game.predictions.findIndex((prediction) => prediction.id === payload.id);
  if (existingIndex >= 0) {
    game.predictions[existingIndex] = { ...game.predictions[existingIndex], ...payload };
  } else {
    game.predictions.push(payload);
  }

  state.editingPrediction = null;
  persist();
  render();
  closeDialog(dialogs.prediction);
}

function handleGameAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const card = event.target.closest('.game-card');
  if (!card) return;
  const gameId = card.dataset.gameId;
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return;

  switch (button.dataset.action) {
    case 'add-prediction':
      openPredictionDialog(game);
      break;
    case 'edit-game':
      openGameDialog(game);
      break;
    case 'delete-game':
      deleteGame(gameId);
      break;
    case 'edit-prediction': {
      const predictionId = button.closest('.prediction').dataset.predictionId;
      const prediction = game.predictions.find((item) => item.id === predictionId);
      if (prediction) {
        openPredictionDialog(game, prediction);
      }
      break;
    }
    case 'delete-prediction': {
      const predictionId = button.closest('.prediction').dataset.predictionId;
      deletePrediction(gameId, predictionId);
      break;
    }
    default:
      break;
  }
}

function deleteGame(gameId) {
  if (!confirm('Delete this game and all associated picks?')) return;
  state.games = state.games.filter((game) => game.id !== gameId);
  persist();
  render();
}

function deletePrediction(gameId, predictionId) {
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return;
  game.predictions = game.predictions.filter((prediction) => prediction.id !== predictionId);
  persist();
  render();
}

function openGameDialog(game) {
  texts.gameDialogTitle.textContent = game ? 'Edit Game' : 'Add Game';
  state.editingGameId = game?.id ?? null;
  forms.game.reset();
  if (game) {
    forms.game.homeTeam.value = game.homeTeam || '';
    forms.game.awayTeam.value = game.awayTeam || '';
    forms.game.kickoff.value = game.kickoff || '';
    forms.game.location.value = game.location || '';
    forms.game.tags.value = (game.tags || []).join(', ');
    forms.game.notes.value = game.notes || '';
  }
  openDialog(dialogs.game);
}

function openPredictionDialog(game, prediction) {
  texts.predictionDialogTitle.textContent = prediction ? 'Edit Prediction' : 'Add Prediction';
  state.editingPrediction = { gameId: game.id, id: prediction?.id };
  forms.prediction.reset();
  forms.prediction.confidence.value = prediction?.confidence ?? 50;
  outputs.confidence.textContent = `${forms.prediction.confidence.value}%`;
  forms.prediction.source.value = prediction?.source ?? '';
  forms.prediction.market.value = prediction?.market ?? '';
  forms.prediction.pick.value = prediction?.pick ?? '';
  forms.prediction.line.value = prediction?.line ?? '';
  forms.prediction.link.value = prediction?.link ?? '';
  forms.prediction.notes.value = prediction?.notes ?? '';
  openDialog(dialogs.prediction);
}

function handleDialogClick(event) {
  if (event.target.matches('[data-close-dialog]')) {
    closeDialog(event.currentTarget);
  }
}

function closeDialog(dialog) {
  dialog.close();
}

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function groupBy(items, getKey) {
  const map = new Map();
  for (const item of items) {
    const key = typeof getKey === 'function' ? getKey(item) : item[getKey];
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  }
  return map;
}

function colorForString(input, alpha = 0.25) {
  const string = input || 'default';
  let hash = 0;
  for (let i = 0; i < string.length; i += 1) {
    hash = string.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsla(${hue}, 70%, 60%, ${alpha})`;
}

function renderSnapshot() {
  const snapshot = selectors.snapshot;
  snapshot.innerHTML = '';
  const totalGames = state.games.length;
  const totalPicks = state.games.reduce((acc, game) => acc + game.predictions.length, 0);
  const highConfidence = state.games
    .flatMap((game) => game.predictions)
    .filter((prediction) => typeof prediction.confidence === 'number' && prediction.confidence >= 70).length;

  const snapshotData = [
    { label: 'Games Tracked', value: totalGames },
    { label: 'Expert Picks Logged', value: totalPicks },
    { label: '70%+ Confidence', value: highConfidence },
  ];

  const grid = document.createElement('div');
  grid.className = 'snapshot-grid';
  snapshotData.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'snapshot-item';
    row.innerHTML = `<strong>${item.value}</strong><span>${item.label}</span>`;
    grid.appendChild(row);
  });
  snapshot.appendChild(grid);

  const marketBreakdown = buildMarketBreakdown(state.games);
  if (marketBreakdown) {
    snapshot.appendChild(marketBreakdown);
  }

  const consensusLeaders = buildConsensusLeaders(state.games);
  if (consensusLeaders) {
    snapshot.appendChild(consensusLeaders);
  }

  const confidenceLeaders = buildConfidenceLeaders(state.games);
  if (confidenceLeaders) {
    snapshot.appendChild(confidenceLeaders);
  }
}

function createSnapshotSection(titleText) {
  const section = document.createElement('section');
  section.className = 'snapshot-section';
  const title = document.createElement('h3');
  title.className = 'snapshot-section__title';
  title.textContent = titleText;
  section.appendChild(title);
  return section;
}

function buildMarketBreakdown(games) {
  const counts = new Map();
  let total = 0;
  games.forEach((game) => {
    game.predictions.forEach((prediction) => {
      total += 1;
      const label = formatMarketLabel(prediction.market);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });

  if (!total) return null;

  const section = createSnapshotSection('Market Coverage');
  const list = document.createElement('ul');
  list.className = 'snapshot-list';

  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  entries.forEach(([market, count]) => {
    const item = document.createElement('li');
    item.className = 'snapshot-row';
    const meta = getMarketMeta(market);

    const chip = document.createElement('span');
    chip.className = 'snapshot-chip';
    chip.textContent = `${meta.icon} ${market}`;
    item.appendChild(chip);

    const metric = document.createElement('span');
    metric.className = 'snapshot-metric';
    const percent = Math.round((count / total) * 100);
    metric.textContent = `${count} pick${count === 1 ? '' : 's'} • ${percent}%`;
    item.appendChild(metric);

    list.appendChild(item);
  });

  section.appendChild(list);
  return section;
}

function buildConsensusLeaders(games) {
  const leaders = games
    .map((game) => ({ game, summary: buildConsensusSummary(game.predictions) }))
    .filter((entry) => entry.summary)
    .sort((a, b) => b.summary.percent - a.summary.percent)
    .slice(0, 3);

  if (!leaders.length) return null;

  const section = createSnapshotSection('Consensus Board (40%+ alignment)');
  const list = document.createElement('ul');
  list.className = 'snapshot-list snapshot-list--stacked';

  leaders.forEach(({ game, summary }) => {
    const item = document.createElement('li');
    item.className = 'snapshot-row snapshot-row--stacked';

    const header = document.createElement('div');
    header.className = 'snapshot-row__header';
    const badge = document.createElement('span');
    badge.className = 'snapshot-badge snapshot-badge--consensus';
    badge.textContent = `${summary.percent}%`;
    header.appendChild(badge);

    const pick = document.createElement('strong');
    pick.textContent = summary.pick;
    header.appendChild(pick);
    item.appendChild(header);

    const detail = document.createElement('div');
    detail.className = 'snapshot-subtext';
    detail.textContent = `${formatMatchup(game)} • ${summary.count} of ${summary.total} sources aligned`;
    item.appendChild(detail);

    list.appendChild(item);
  });

  section.appendChild(list);
  return section;
}

function buildConfidenceLeaders(games) {
  const entries = [];
  games.forEach((game) => {
    game.predictions.forEach((prediction) => {
      if (typeof prediction.confidence === 'number' && !Number.isNaN(prediction.confidence)) {
        entries.push({ game, prediction });
      }
    });
  });

  if (!entries.length) return null;

  entries.sort((a, b) => b.prediction.confidence - a.prediction.confidence);
  const top = entries.slice(0, 5);

  const section = createSnapshotSection('Highest Confidence Board');
  const list = document.createElement('ul');
  list.className = 'snapshot-list snapshot-list--stacked';

  top.forEach(({ game, prediction }) => {
    const item = document.createElement('li');
    item.className = 'snapshot-row snapshot-row--stacked';

    const header = document.createElement('div');
    header.className = 'snapshot-row__header';

    const badge = document.createElement('span');
    badge.className = 'snapshot-badge';
    badge.textContent = `${prediction.confidence}%`;
    header.appendChild(badge);

    const source = document.createElement('span');
    source.className = 'snapshot-source';
    source.textContent = prediction.source;
    header.appendChild(source);

    if (prediction.market) {
      const market = document.createElement('span');
      market.className = 'snapshot-subtext';
      market.textContent = `${getMarketMeta(prediction.market).icon} ${formatMarketLabel(prediction.market)}`;
      header.appendChild(market);
    }

    item.appendChild(header);

    const detail = document.createElement('div');
    detail.className = 'snapshot-subtext';
    const odds = prediction.line ? ` (${prediction.line})` : '';
    detail.textContent = `${formatMatchup(game)} • ${prediction.pick}${odds}`;
    item.appendChild(detail);

    list.appendChild(item);
  });

  section.appendChild(list);
  return section;
}

function formatMatchup(game) {
  if (!game) return '';
  const away = game.awayTeam || 'Away';
  const home = game.homeTeam || 'Home';
  return `${away} @ ${home}`;
}

function normalizeGames(games) {
  return games.map((game) => ({
    ...game,
    id: game.id ?? generateId(),
    homeTeam: typeof game.homeTeam === 'string' ? game.homeTeam.trim() : game.homeTeam,
    awayTeam: typeof game.awayTeam === 'string' ? game.awayTeam.trim() : game.awayTeam,
    kickoff: typeof game.kickoff === 'string' ? game.kickoff.trim() : game.kickoff,
    location: typeof game.location === 'string' ? game.location.trim() : game.location,
    notes: typeof game.notes === 'string' ? game.notes.trim() : game.notes,
    tags: Array.isArray(game.tags) ? game.tags.map((tag) => (typeof tag === 'string' ? tag.trim() : tag)).filter(Boolean) : [],
    predictions: Array.isArray(game.predictions)
      ? game.predictions.map((prediction) => ({
          ...prediction,
          id: prediction.id ?? generateId(),
          source: typeof prediction.source === 'string' ? prediction.source.trim() : prediction.source,
          market:
            typeof prediction.market === 'string'
              ? prediction.market.trim()
              : prediction.market
              ? String(prediction.market)
              : '',
          pick: typeof prediction.pick === 'string' ? prediction.pick.trim() : prediction.pick,
          line: typeof prediction.line === 'string' ? prediction.line.trim() : prediction.line,
          notes: typeof prediction.notes === 'string' ? prediction.notes.trim() : prediction.notes,
          link: typeof prediction.link === 'string' ? prediction.link.trim() : prediction.link,
          confidence: (() => {
            if (prediction.confidence === undefined || prediction.confidence === null || prediction.confidence === '') {
              return undefined;
            }
            if (typeof prediction.confidence === 'number') {
              return Number.isFinite(prediction.confidence) ? prediction.confidence : undefined;
            }
            const coerced = Number(prediction.confidence);
            return Number.isFinite(coerced) ? coerced : undefined;
          })(),
        }))
      : [],
  }));
}

function exportData() {
  const blob = new Blob([JSON.stringify({ games: state.games }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `football-picks-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function handleImportFile(event) {
  const [file] = event.target.files;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    try {
      const parsed = JSON.parse(loadEvent.target.result);
      if (!Array.isArray(parsed.games)) {
        throw new Error('Invalid file format.');
      }
      state.games = normalizeGames(parsed.games);
      persist();
      render();
    } catch (error) {
      alert('Could not import data. Please ensure the JSON file was exported from this tool.');
      console.error(error);
    } finally {
      selectors.importFileInput.value = '';
    }
  };
  reader.readAsText(file);
}

function sampleSlate() {
  return normalizeGames([
    {
      id: generateId(),
      homeTeam: 'Kansas City Chiefs',
      awayTeam: 'Philadelphia Eagles',
      kickoff: 'Mon • 8:15 PM ET',
      location: 'GEHA Field at Arrowhead Stadium',
      tags: ['primetime', 'AFC', 'rematch'],
      notes: 'Mahomes vs Hurts rematch. Wind 12 mph, light rain expected. Chiefs off bye week.',
      predictions: [
        {
          id: generateId(),
          source: 'PFF Forecast',
          market: 'Spread',
          pick: 'Chiefs -2.5',
          line: '-110',
          confidence: 62,
          notes: 'Trusting KC off a bye with defensive edge',
          link: 'https://www.pff.com',
        },
        {
          id: generateId(),
          source: 'Action Network',
          market: 'Moneyline',
          pick: 'Chiefs ML',
          line: '-140',
          confidence: 58,
          notes: 'Model makes KC -3.2',
          link: 'https://www.actionnetwork.com',
        },
        {
          id: generateId(),
          source: 'Sharp Clark',
          market: 'Total',
          pick: 'Under 47.5',
          line: '-110',
          confidence: 70,
          notes: 'Both defenses top-5 in EPA over last month',
          link: 'https://www.sharpclark.com',
        },
        {
          id: generateId(),
          source: 'Ringer Gambling Show',
          market: 'Spread',
          pick: 'Eagles +2.5',
          line: '-105',
          confidence: 55,
          notes: 'Hurts legs can keep them in it late',
          link: 'https://www.theringer.com',
        },
      ],
    },
    {
      id: generateId(),
      homeTeam: 'San Francisco 49ers',
      awayTeam: 'Dallas Cowboys',
      kickoff: 'Sun • 4:25 PM ET',
      location: 'Levi\'s Stadium',
      tags: ['NFC', 'game-of-the-week'],
      notes: 'Cowboys on short rest after MNF. 49ers pass rush vs DAL OL injuries.',
      predictions: [
        {
          id: generateId(),
          source: 'The Athletic Beat',
          market: 'Spread',
          pick: '49ers -3.5',
          line: '-115',
          confidence: 68,
          notes: 'Shanahan scripted plays vs DAL man coverage',
          link: 'https://www.theathletic.com',
        },
        {
          id: generateId(),
          source: 'ESPN Analytics',
          market: 'Moneyline',
          pick: '49ers ML',
          line: '-175',
          confidence: 72,
          notes: 'FPI gives SF 67% win probability',
          link: 'https://www.espn.com',
        },
        {
          id: generateId(),
          source: 'Warren Sharp',
          market: 'Total',
          pick: 'Over 46.5',
          line: '-110',
          confidence: 64,
          notes: 'Expect explosives vs aggressive defenses',
          link: 'https://www.sharpfootballanalysis.com',
        },
        {
          id: generateId(),
          source: 'RotoGrinders Betting',
          market: 'Team Total',
          pick: '49ers team total over 24.5',
          line: '-115',
          confidence: 61,
          notes: 'Dallas defensive splits dip outdoors; SF offense rolling',
          link: 'https://rotogrinders.com',
        },
      ],
    },
    {
      id: generateId(),
      homeTeam: 'Baltimore Ravens',
      awayTeam: 'Miami Dolphins',
      kickoff: 'Sun • 1:00 PM ET',
      location: "M&T Bank Stadium",
      tags: ['AFC', 'weather watch'],
      notes: 'Forecast calling for breezy conditions. Monitor OL injuries for Miami.',
      predictions: [
        {
          id: generateId(),
          source: 'BettingPros Consensus',
          market: 'Spread',
          pick: 'Ravens -3',
          line: '-115',
          confidence: 60,
          notes: 'Market shading toward Baltimore with injury concerns for Dolphins OL',
          link: 'https://www.bettingpros.com',
        },
        {
          id: generateId(),
          source: 'Establish The Run',
          market: 'Player Prop',
          pick: 'Lamar Jackson over 58.5 rush yds',
          line: '-120',
          confidence: 74,
          notes: 'Miami man coverage opens rushing lanes for QB scrambles',
          link: 'https://establishtherun.com',
        },
        {
          id: generateId(),
          source: 'The Lines Podcast',
          market: 'Moneyline',
          pick: 'Ravens ML',
          line: '-160',
          confidence: 65,
          notes: 'Trusting Harbaugh off mini-bye with rest advantage',
          link: 'https://www.thelines.com',
        },
        {
          id: generateId(),
          source: 'VEGAS Insider',
          market: 'Total',
          pick: 'Over 49.5',
          line: '-108',
          confidence: 52,
          notes: 'Projected pace increase with explosive playmakers on both sides',
          link: 'https://www.vegasinsider.com',
        },
      ],
    },
  ]);
}
