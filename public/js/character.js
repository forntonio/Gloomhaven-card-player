document.addEventListener('DOMContentLoaded', () => {
  const charId = new URLSearchParams(window.location.search).get('id');
  const handSelectionSection = document.getElementById('handSelection');
  const zonesSection = document.getElementById('zonesSection');
  const charNameHeading = document.getElementById('charNameHeading');
  const handSizeSpan = document.getElementById('handSizeSpan');
  const availableCardsDiv = document.getElementById('availableCards');
  const handForm = document.getElementById('handForm');
  const handMessage = document.getElementById('handMessage');
  const handCardsDiv = document.getElementById('handCards');
  const activeCardsDiv = document.getElementById('activeCards');
  const discardCardsDiv = document.getElementById('discardCards');
  const lostCardsDiv = document.getElementById('lostCards');

  async function fetchCharacter() {
    const res = await fetch(`/api/characters/${charId}`);
    if (res.status === 404) {
      alert('Character not found');
      window.location.href = 'characters.html';
      return null;
    }
    if (res.status === 403) {
      alert('Access denied');
      window.location.href = 'characters.html';
      return null;
    }
    if (res.status === 401) {
      window.location.href = 'login.html';
      return null;
    }
    const char = await res.json();
    return char;
  }

  function renderZones(char) {
    // Hide selection, show zones
    handSelectionSection.style.display = 'none';
    zonesSection.style.display = 'block';
    charNameHeading.textContent = char.name;
    renderZone(handCardsDiv, char.zones.hand, 'hand');
    renderZone(activeCardsDiv, char.zones.active, 'active');
    renderZone(discardCardsDiv, char.zones.discard, 'discard');
    renderZone(lostCardsDiv, char.zones.lost, 'lost');
  }

  function renderZone(container, cards, zoneName) {
    container.innerHTML = '';
    cards.forEach(card => {
      const row = document.createElement('div');
      row.className = 'card-row';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = card.name;
      row.appendChild(nameSpan);
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'card-actions';
      if (zoneName === 'active') {
        // counter controls
        const minusBtn = document.createElement('button');
        minusBtn.textContent = '-';
        minusBtn.addEventListener('click', () => changeCounter(card.id, -1));
        const counterSpan = document.createElement('span');
        counterSpan.textContent = ` ${card.counter} `;
        const plusBtn = document.createElement('button');
        plusBtn.textContent = '+';
        plusBtn.addEventListener('click', () => changeCounter(card.id, 1));
        actionsDiv.appendChild(minusBtn);
        actionsDiv.appendChild(counterSpan);
        actionsDiv.appendChild(plusBtn);
        // move to discard or lost
        ['discard', 'lost'].forEach(target => {
          const btn = document.createElement('button');
          btn.textContent = `→ ${target}`;
          btn.addEventListener('click', () => moveCard(card.id, zoneName, target));
          actionsDiv.appendChild(btn);
        });
      } else if (zoneName === 'hand') {
        ['active', 'discard', 'lost'].forEach(target => {
          const btn = document.createElement('button');
          btn.textContent = `→ ${target}`;
          btn.addEventListener('click', () => moveCard(card.id, zoneName, target));
          actionsDiv.appendChild(btn);
        });
      } else if (zoneName === 'discard') {
        ['hand', 'lost'].forEach(target => {
          const btn = document.createElement('button');
          btn.textContent = `→ ${target}`;
          btn.addEventListener('click', () => moveCard(card.id, zoneName, target));
          actionsDiv.appendChild(btn);
        });
      } else if (zoneName === 'lost') {
        ['hand'].forEach(target => {
          const btn = document.createElement('button');
          btn.textContent = `→ ${target}`;
          btn.addEventListener('click', () => moveCard(card.id, zoneName, target));
          actionsDiv.appendChild(btn);
        });
      }
      row.appendChild(actionsDiv);
      container.appendChild(row);
    });
  }

  async function moveCard(cardId, fromZone, toZone) {
    await fetch(`/api/characters/${charId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, fromZone, toZone })
    });
    loadCharacter();
  }

  async function changeCounter(cardId, delta) {
    await fetch(`/api/characters/${charId}/counter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, delta })
    });
    loadCharacter();
  }

  async function loadCharacter() {
    const char = await fetchCharacter();
    if (!char) return;
    if (char.zones.hand.length === 0) {
      // Need to select hand
      handSelectionSection.style.display = 'block';
      zonesSection.style.display = 'none';
      charNameHeading.textContent = char.name;
      handSizeSpan.textContent = char.handSize;
      loadAvailableCards(char.classId, char.level, char.handSize);
    } else {
      renderZones(char);
    }
  }

  async function loadAvailableCards(classId, level, handSize) {
    availableCardsDiv.innerHTML = '';
    try {
      const res = await fetch(`/api/cards?classId=${classId}&level=${level}`);
      const cards = await res.json();
      cards.forEach(card => {
        const div = document.createElement('div');
        div.className = 'card-row';
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = card.id;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(' ' + card.name + ' (L' + card.level + ')'));
        div.appendChild(label);
        availableCardsDiv.appendChild(div);
      });
      handForm.onsubmit = async (e) => {
        e.preventDefault();
        const selected = Array.from(availableCardsDiv.querySelectorAll('input[type=checkbox]:checked')).map(cb => parseInt(cb.value, 10));
        if (selected.length !== handSize) {
          handMessage.textContent = `You must select exactly ${handSize} cards.`;
          return;
        }
        handMessage.textContent = '';
        const res2 = await fetch(`/api/characters/${charId}/hand`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardIds: selected })
        });
        const data = await res2.json();
        if (res2.ok) {
          loadCharacter();
        } else {
          handMessage.textContent = data.error || 'Error saving hand';
        }
      };
    } catch (e) {
      availableCardsDiv.textContent = 'Error loading cards';
    }
  }

  // init
  loadCharacter();
});