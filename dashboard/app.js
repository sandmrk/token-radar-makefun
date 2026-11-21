(function() {
  'use strict';

  const DATA = window.RADAR;
  let state = {
    q: '',
    category: 'All',
    chain: 'All',
    tab: 'Pre-token',
    selected: null,
    sortCol: 'implied_value_usd',
    sortDir: 'desc'
  };

  // --- Helpers ---
  function el(tag, props, children) {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k.startsWith('data-')) e.setAttribute(k, props[k]);
        else if (k === 'className') e.className = props[k];
        else e[k] = props[k];
      }
    }
    if (children) {
      children.forEach(c => {
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else if (c instanceof Node) e.appendChild(c);
      });
    }
    return e;
  }

  function fmtUsd(v) {
    if (v === null || v === undefined) return 'n/a';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
    return '$' + v.toFixed(0);
  }

  function fmtPct(v) {
    if (v === null || v === undefined) return 'n/a';
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  }

  function ageDays(row) {
    if (!row.listed_at) return null;
    const listed = new Date(row.listed_at);
    const asOf = new Date(DATA.as_of);
    return Math.floor((asOf - listed) / (1000 * 60 * 60 * 24));
  }

  function fmtAge(days) {
    if (days === null) return 'unknown';
    if (days < 365) return days + 'd';
    return (days / 365.25).toFixed(1) + 'y';
  }

  // --- State & URL ---
  function updateHash() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'All') params.set('category', state.category);
    if (state.chain !== 'All') params.set('chain', state.chain);
    params.set('tab', state.tab);
    if (state.selected) params.set('selected', state.selected);
    params.set('sortCol', state.sortCol);
    params.set('sortDir', state.sortDir);
    history.replaceState(null, '', '#' + params.toString());
  }

  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    state.q = params.get('q') || '';
    state.category = params.get('category') || 'All';
    state.chain = params.get('chain') || 'All';
    state.tab = params.get('tab') || 'Pre-token';
    state.selected = params.get('selected') || null;
    state.sortCol = params.get('sortCol') || 'implied_value_usd';
    state.sortDir = params.get('sortDir') || 'desc';
  }

  // --- Detail View ---
window.showDetail = function(slug) {
  const row = DATA.rows.find(r => r.slug === slug);
  if (!row) return;
  state.selected = slug;
  updateHash();

  const existing = document.querySelector('.drawer');
  if (existing) existing.remove();

  const chains = row.chains || [];
  const dialog = el('div', { className: 'drawer' }, [
    el('div', { className: 'drawer-head' }, [
      el('div', {}, [
        el('div', { className: 'rank-line' }, ['Rank ' + row.rank + ' of ' + DATA.board_size]),
        el('h2', {}, [row.name]),
        el('div', { className: 'sub' }, [row.category + ' · ' + chains.join(', ')])
      ]),
      el('button', { className: 'close-btn' }, ['Close'])
    ]),
    el('section', { className: 'detail-section' }, [
      el('h3', {}, ['Implied value — how this number is built']),
      el('div', { className: 'equation' }, [
        el('div', {}, [el('span', {}, ['TVL']), el('b', { className: 'num' }, [fmtUsd(row.tvl_usd)])]),
        el('div', {}, [el('span', {}, ['Category multiple']), el('b', { className: 'num' }, ['x' + row.category_multiple.toFixed(3)])]),
        el('div', {}, [el('span', {}, ['Momentum factor (7d)']), el('b', { className: 'num' }, ['x' + row.momentum_factor.toFixed(3)])]),
        el('div', {}, [el('span', {}, ['Seasoning factor (listed age)']), el('b', { className: 'num' }, ['x' + row.seasoning_factor.toFixed(3)])]),
        el('div', { className: 'eq-total' }, [el('span', {}, ['Implied value']), el('b', { className: 'num' }, [fmtUsd(row.implied_value_usd)])])
      ]),
      el('p', { className: 'sub' }, [row.listed_at ? 'Listed ' + row.listed_at + ' · ' + fmtAge(ageDays(row)) + ' with no token on record.' : 'Listing date unknown.']),
      el('p', { className: 'sub' }, [
        (() => {
          const recomputed = Math.max(1, Math.round(row.tvl_usd * row.category_multiple * row.momentum_factor * row.seasoning_factor));
          return recomputed === row.implied_value_usd 
            ? 'This page recomputes the row from the snapshot figures and gets the same number board.json carries. An estimate from snapshot figures, not a price.'
            : 'This page recomputes the row as ' + fmtUsd(recomputed) + ', which differs from the board — the data would be stale. An estimate from snapshot figures, not a price.';
        })()
      ])
    ]),
    el('section', { className: 'detail-section' }, [
      el('h3', {}, ['Farm plan']),
      (() => {
        const chain = chains.length ? chains[0] : 'its main chain';
        const cat = (row.category || '').toLowerCase();
        let action;
        if (cat.includes('lend') || cat.includes('cdp')) action = 'Supply $100 of USDC to ' + row.name + ' on ' + chain + ' and manage position.';
        else if (cat.includes('dex') || cat.includes('yield')) action = 'Provide $100 of liquidity to ' + row.name + '\'s pool on ' + chain + '.';
        else if (cat.includes('perpetual') || cat.includes('derivative')) action = 'Deposit $100 of USDC as margin on ' + row.name + ' and hedge.';
        else if (cat.includes('gaming')) action = 'Engage in ' + row.name + ' gameplay on ' + chain + ' with $100 of assets.';
        else if (cat.includes('nft')) action = 'List or bid on ' + row.name + ' assets on ' + chain + ' with $100.';
        else if (cat.includes('payments')) action = 'Use ' + row.name + ' to transact $100 on ' + chain + '.';
        else if (cat.includes('privacy')) action = 'Shield $100 on ' + row.name + ' on ' + chain + '.';
        else if (cat.includes('ai')) action = 'Train or compute with ' + row.name + ' using $100 on ' + chain + '.';
        else action = 'Deposit $100 of USDC into ' + row.name + ' on ' + chain + ' and keep the position open.';
        
        const steps = [
          { text: 'Prepare a dedicated wallet for ' + row.name + ' farming.', cost: '$1 gas', time: '5 mins' },
          { text: action, cost: '$100 capital + gas', time: '20 mins' },
          { text: 'Weekly interaction with ' + row.name + '.', cost: '$2 gas/week', time: '10 mins/week' },
          { text: 'Maintain position for snapshot eligibility.', cost: 'opportunity cost', time: 'ongoing' }
        ];
        
        const ol = el('ol', { className: 'steps' }, []);
        steps.forEach((step) => {
          ol.appendChild(el('li', {}, [
            el('div', { className: 'step-card' }, [
              el('b', {}, [step.text]),
              el('div', { className: 'step-cost' }, ['Cost: ' + step.cost + '. Time: ' + step.time + '.'])
            ])
          ]));
        });
        return ol;
      })()
    ])
  ]);

  dialog.querySelector('.close-btn').addEventListener('click', () => window.closeDetail());
  
  document.body.appendChild(dialog);
  if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
  else dialog.setAttribute('open', '');
  
  dialog.addEventListener('close', () => { if (state.selected === slug) window.closeDetail(); });
};

window.closeDetail = function() {
  if (state.selected === null) return;
  state.selected = null;
  const dialog = document.querySelector('.drawer');
  if (dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    dialog.remove();
  }
  updateHash();
  render();
};

  // --- Rendering ---
  function render() {
    const board = document.getElementById('board');
    board.textContent = '';

    // Header
    const topbar = el('header', { className: 'topbar' }, [
      el('div', { className: 'brand' }, [
        el('span', { className: 'radar-mark' }, ['◎']),
        el('span', { className: 'brand-name' }, ['Token Radar'])
      ]),
      el('div', { className: 'top-meta' }, [
        el('span', {}, ['Snapshot ' + DATA.as_of]),
        el('span', {}, ['DefiLlama protocol index']),
        el('span', {}, [DATA.model_version + ' model'])
      ])
    ]);

    // Hero
    const hero = el('section', { className: 'hero' }, [
      el('h1', {}, [DATA.watchlist_size + ' watchlist protocols, ranked by implied value']),
      el('p', { className: 'lede' }, ['The watchlist is every protocol with at least $50M TVL and no token on record; the early radar adds ' + DATA.early_size + ' smaller pre-token protocols; implied value is a model estimate, not a price.']),
      el('div', { className: 'stat-grid' }, [
        el('div', { className: 'stat' }, [el('span', {}, ['Watchlist covered']), el('b', {}, ['40 / 40'])]),
        el('div', { className: 'stat' }, [el('span', {}, ['Pre-token rows scored']), el('b', {}, [String(DATA.board_size)])]),
        el('div', { className: 'stat' }, [el('span', {}, ['Early rows below the floor']), el('b', {}, [String(DATA.early_size)])]),
        el('div', { className: 'stat' }, [el('span', {}, ['Live-token protocols set aside']), el('b', {}, [String(DATA.live_size)])])
      ])
    ]);

    // Controls
    const searchInput = el('input', { type: 'search', className: 'search-input', placeholder: 'Search name, category or chain', value: state.q });
    searchInput.addEventListener('input', (e) => { state.q = e.target.value; updateHash(); render(); });
    
    const catSelect = el('select', { className: 'select' }, [el('option', { value: 'All' }, ['All categories'])]);
    const cats = [...new Set(DATA.rows.map(r => r.category))].sort();
    cats.forEach(c => catSelect.appendChild(el('option', { value: c, selected: state.category === c }, [c])));
    catSelect.addEventListener('change', (e) => { state.category = e.target.value; updateHash(); render(); });

    const chainSelect = el('select', { className: 'select' }, [el('option', { value: 'All' }, ['All chains'])]);
    const chains = [...new Set(DATA.rows.flatMap(r => r.chains))].sort();
    chains.forEach(c => chainSelect.appendChild(el('option', { value: c, selected: state.chain === c }, [c])));
    chainSelect.addEventListener('change', (e) => { state.chain = e.target.value; updateHash(); render(); });

    const tabPre = el('button', { className: 'btn', 'aria-pressed': state.tab === 'Pre-token' }, ['Pre-token']);
    tabPre.addEventListener('click', () => { state.tab = 'Pre-token'; updateHash(); render(); });
    const tabLive = el('button', { className: 'btn', 'aria-pressed': state.tab === 'Live-token' }, ['Live token']);
    tabLive.addEventListener('click', () => { state.tab = 'Live-token'; updateHash(); render(); });

    // Filtering
    const search = state.q.toLowerCase();
    const rows = (state.tab === 'Pre-token' ? DATA.rows : DATA.live).filter(r => {
      const match = r.name.toLowerCase().includes(search) || r.slug.toLowerCase().includes(search) || r.category.toLowerCase().includes(search) || r.chains.some(c => c.toLowerCase().includes(search));
      const catMatch = state.category === 'All' || r.category === state.category;
      const chainMatch = state.chain === 'All' || r.chains.includes(state.chain);
      return match && catMatch && chainMatch;
    });

    const controls = el('div', { className: 'controls' }, [
      el('div', { className: 'field' }, [el('label', {}, ['Search']), searchInput]),
      el('div', { className: 'field' }, [el('label', {}, ['Category']), catSelect]),
      el('div', { className: 'field' }, [el('label', {}, ['Chain']), chainSelect]),
      el('div', { className: 'field' }, [el('div', { className: 'tabs' }, [tabPre, tabLive])]),
      el('span', { className: 'count' }, [rows.length + ' rows shown'])
    ]);

    const shell = el('div', { className: 'shell' }, [topbar, hero, controls]);

    // Panels
    if (rows.length === 0) {
      shell.appendChild(el('div', { className: 'panel' }, [el('div', { className: 'empty' }, [
        el('h2', {}, ['No protocol matches that filter']),
        el('button', { className: 'btn btn-primary', onclick: () => { state.q = ''; state.category = 'All'; state.chain = 'All'; updateHash(); render(); } }, ['Clear filters'])
      ])]));
    } else {
      const isPre = state.tab === 'Pre-token';
      // Sorting
      if (isPre) {
        rows.sort((a, b) => {
          let valA = a[state.sortCol], valB = b[state.sortCol];
          if (state.sortCol === 'change_7d') {
            valA = (valA === null || valA === undefined) ? -1e18 : valA;
            valB = (valB === null || valB === undefined) ? -1e18 : valB;
          } else if (state.sortCol === 'listed_at') {
            valA = valA ? new Date(valA).getTime() : -1e18;
            valB = valB ? new Date(valB).getTime() : -1e18;
          }
          if (valA < valB) return state.sortDir === 'asc' ? -1 : 1;
          if (valA > valB) return state.sortDir === 'asc' ? 1 : -1;
          return a.slug.localeCompare(b.slug);
        });
      } else {
        rows.sort((a, b) => (b.mcap_usd || 0) - (a.mcap_usd || 0));
      }

      const maxImplied = Math.max(1, ...rows.map(r => r.implied_value_usd || 0));
      const table = el('table', { className: 'board-table' }, [
        el('thead', {}, [el('tr', {}, isPre ? (() => {
          const cols = [
            { key: 'rank', label: 'Rank' },
            { key: 'name', label: 'Protocol' },
            { key: 'tvl_usd', label: 'TVL' },
            { key: 'change_7d', label: '7d' },
            { key: 'listed_at', label: 'Listed' },
            { key: 'implied_value_usd', label: 'Implied value' }
          ];
          const cells = cols.map(c => {
            const btn = el('button', { type: 'button', className: 'sort-btn' }, [
              c.label + (state.sortCol === c.key ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : '')
            ]);
            btn.addEventListener('click', () => {
              if (state.sortCol === c.key) {
                state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
              } else {
                state.sortCol = c.key;
                state.sortDir = (c.key === 'name') ? 'asc' : 'desc';
              }
              updateHash();
              render();
            });
            return el('th', {}, [btn]);
          });
          cells.push(el('th', {}, ['Token']));
          return cells;
        })() : [
          el('th', {}, ['Protocol']), el('th', {}, ['TVL']), el('th', {}, ['7d']), el('th', {}, ['Market cap']), el('th', {}, ['Token'])
        ])])
      ]);
      const tbody = el('tbody', {}, []);
      rows.forEach(r => {
        const tr = el('tr', { 'data-selected': String(isPre && state.selected === r.slug), tabindex: isPre ? '0' : undefined }, isPre ? [
          el('td', { className: 'num' }, [el('span', { className: 'rank-pill' }, [String(r.rank)])]),
          el('td', { className: 'name-cell' }, [el('b', {}, [r.name]), el('div', { className: 'sub' }, [r.category + ' · ' + r.chains.slice(0, 2).join(', ')])]),
          el('td', { className: 'num' }, [fmtUsd(r.tvl_usd)]),
          el('td', { className: 'num ' + (r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : '') }, [fmtPct(r.change_7d)]),
          el('td', {}, [r.listed_at ? new Date(r.listed_at).toLocaleDateString() : 'unknown', el('div', { className: 'sub' }, [fmtAge(ageDays(r))])]),
          el('td', { className: 'implied-cell' }, [el('div', { className: 'bar' }, [el('i', { style: 'width: ' + Math.max(3, Math.round(r.implied_value_usd / maxImplied * 100)) + '%' }, [])]), el('span', { className: 'num' }, [fmtUsd(r.implied_value_usd)])]),
          el('td', {}, [el('span', { className: 'chip' }, [el('i', {}, []), 'no token'])])
        ] : [
          el('td', { className: 'name-cell' }, [el('b', {}, [r.name]), el('div', { className: 'sub' }, [r.category + ' · ' + r.chains.slice(0, 2).join(', ')])]),
          el('td', { className: 'num' }, [fmtUsd(r.tvl_usd)]),
          el('td', { className: 'num ' + (r.change_7d > 0 ? 'pos' : r.change_7d < 0 ? 'neg' : '') }, [fmtPct(r.change_7d)]),
          el('td', { className: 'num' }, [fmtUsd(r.mcap_usd)]),
          el('td', {}, [el('span', { className: 'chip' }, [el('i', {}, []), 'already trades'])])
        ]);
        if (isPre) tr.addEventListener('click', () => window.showDetail(r.slug));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      shell.appendChild(el('div', { className: 'panel' }, [el('div', { className: 'table-wrap' }, [table])]));
    }

    if (state.tab === 'Pre-token') {
      shell.appendChild(el('div', { className: 'panel model-panel' }, [
        el('h2', {}, ['How implied value is computed']),
        el('div', { className: 'formula' }, ['implied = TVL x category multiple x momentum x seasoning']),
        el('p', {}, ['The category multiple is the median market-cap/TVL ratio of already-tokened protocols in the same category (global median when a category has too few); momentum maps the 7-day TVL change clamped to [-30%, +50%] onto [0.85, 1.20]; seasoning maps days listed with no token, capped at 365, onto [0.90, 1.15].'])
      ]));
    } else {
      shell.appendChild(el('p', { className: 'live-note' }, ['These protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.']));
    }

    shell.appendChild(el('p', { className: 'footer-note' }, ['Built from a sealed DefiLlama snapshot dated ' + DATA.as_of + '. Figures are model estimates for research, not financial advice.']));
    board.appendChild(shell);
    
    if (state.selected) {
      window.showDetail(state.selected);
    }
  }

  // --- Init ---
  readHash();
  render();
  window.addEventListener('hashchange', () => { readHash(); render(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.closeDetail(); });
  window.render = render;
})();
