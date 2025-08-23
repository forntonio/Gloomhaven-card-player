document.addEventListener('DOMContentLoaded', () => {
  const userMessage = document.getElementById('userMessage');
  const usersBody = document.getElementById('usersBody');
  const createUserForm = document.getElementById('createUserForm');
  const newUsername = document.getElementById('newUsername');
  const newRole = document.getElementById('newRole');

  const gameMessage = document.getElementById('gameMessage');
  const gamesList = document.getElementById('gamesList');
  const createGameForm = document.getElementById('createGameForm');
  const gameNameInput = document.getElementById('gameName');

  const classMessage = document.getElementById('classMessage');
  const classesList = document.getElementById('classesList');
  const createClassForm = document.getElementById('createClassForm');
  const classGameSelect = document.getElementById('classGameSelect');
  const classNameInput = document.getElementById('className');
  const classHandSizeInput = document.getElementById('classHandSize');

  const cardMessage = document.getElementById('cardMessage');
  const cardsList = document.getElementById('cardsList');
  const createCardForm = document.getElementById('createCardForm');
  const cardClassSelect = document.getElementById('cardClassSelect');
  const cardNameInput = document.getElementById('cardName');
  const cardLevelInput = document.getElementById('cardLevel');
  const cardImageInput = document.getElementById('cardImage');

  // Check admin access
  async function ensureAdmin() {
    const res = await fetch('/api/user');
    if (res.status === 401) {
      window.location.href = 'login.html';
      return false;
    }
    const user = await res.json();
    if (user.role !== 'admin') {
      window.location.href = 'characters.html';
      return false;
    }
    return true;
  }

  async function loadUsers() {
    usersBody.innerHTML = '';
    try {
      const res = await fetch('/api/users');
      const users = await res.json();
      users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${u.username}</td><td>${u.role}</td>`;
        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.textContent = 'Reset Password';
        btn.addEventListener('click', () => resetPassword(u.username));
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);
        usersBody.appendChild(tr);
      });
    } catch (e) {
      usersBody.innerHTML = '<tr><td colspan="3">Error loading users</td></tr>';
    }
  }

  async function resetPassword(username) {
    if (!confirm(`Reset password for ${username}?`)) return;
    const res = await fetch(`/api/users/${encodeURIComponent(username)}/reset`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      alert('Password reset');
    } else {
      alert(data.error || 'Error resetting password');
    }
  }

  createUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    userMessage.textContent = '';
    const username = newUsername.value.trim();
    const role = newRole.value;
    if (!username) {
      userMessage.textContent = 'Username required';
      return;
    }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, role })
      });
      const data = await res.json();
      if (res.ok) {
        userMessage.style.color = 'green';
        userMessage.textContent = 'User created';
        createUserForm.reset();
        loadUsers();
      } else {
        userMessage.style.color = 'red';
        userMessage.textContent = data.error || 'Error creating user';
      }
    } catch (e) {
      userMessage.style.color = 'red';
      userMessage.textContent = 'Network error';
    }
  });

  async function loadGames() {
    try {
      const res = await fetch('/api/games');
      const games = await res.json();
      gamesList.innerHTML = '';
      classGameSelect.innerHTML = '';
      cardClassSelect.innerHTML = '';
      games.forEach(g => {
        const li = document.createElement('li');
        li.textContent = `${g.id}: ${g.name}`;
        gamesList.appendChild(li);
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        classGameSelect.appendChild(opt);
      });
      // After loading games, load classes and cards selects
      loadClassesList();
      loadCardSelectOptions();
    } catch (e) {
      gamesList.innerHTML = '<li>Error loading games</li>';
    }
  }

  createGameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gameMessage.textContent = '';
    const name = gameNameInput.value.trim();
    if (!name) {
      gameMessage.textContent = 'Name required';
      return;
    }
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (res.ok) {
        gameMessage.style.color = 'green';
        gameMessage.textContent = 'Game added';
        createGameForm.reset();
        loadGames();
      } else {
        gameMessage.style.color = 'red';
        gameMessage.textContent = data.error || 'Error adding game';
      }
    } catch (e) {
      gameMessage.style.color = 'red';
      gameMessage.textContent = 'Network error';
    }
  });

  async function loadClassesList() {
    try {
      const gamesRes = await fetch('/api/games');
      const games = await gamesRes.json();
      classesList.innerHTML = '';
      for (const game of games) {
        const res = await fetch(`/api/classes?gameId=${game.id}`);
        const classes = await res.json();
        if (classes.length > 0) {
          const div = document.createElement('div');
          div.innerHTML = `<h4>${game.name}</h4>`;
          const ul = document.createElement('ul');
          classes.forEach(cls => {
            const li = document.createElement('li');
            li.textContent = `${cls.id}: ${cls.name} (Hand ${cls.handSize})`;
            ul.appendChild(li);
          });
          div.appendChild(ul);
          classesList.appendChild(div);
        }
      }
    } catch (e) {
      classesList.textContent = 'Error loading classes';
    }
  }

  createClassForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    classMessage.textContent = '';
    const gameId = classGameSelect.value;
    const name = classNameInput.value.trim();
    const handSize = parseInt(classHandSizeInput.value, 10);
    if (!name) {
      classMessage.textContent = 'Class name required';
      return;
    }
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: parseInt(gameId, 10), name, handSize })
      });
      const data = await res.json();
      if (res.ok) {
        classMessage.style.color = 'green';
        classMessage.textContent = 'Class added';
        createClassForm.reset();
        loadGames();
      } else {
        classMessage.style.color = 'red';
        classMessage.textContent = data.error || 'Error adding class';
      }
    } catch (e) {
      classMessage.style.color = 'red';
      classMessage.textContent = 'Network error';
    }
  });

  async function loadCardSelectOptions() {
    // Populate cardClassSelect with all classes
    cardClassSelect.innerHTML = '';
    try {
      const gamesRes = await fetch('/api/games');
      const games = await gamesRes.json();
      for (const game of games) {
        const classesRes = await fetch(`/api/classes?gameId=${game.id}`);
        const classes = await classesRes.json();
        classes.forEach(cls => {
          const opt = document.createElement('option');
          opt.value = cls.id;
          opt.textContent = `${game.name} - ${cls.name}`;
          cardClassSelect.appendChild(opt);
        });
      }
    } catch (e) {
      // ignore
    }
  }

  async function loadCardsList() {
    cardsList.innerHTML = '';
    try {
      // Group by class
      const gamesRes = await fetch('/api/games');
      const games = await gamesRes.json();
      for (const game of games) {
        const classesRes = await fetch(`/api/classes?gameId=${game.id}`);
        const classes = await classesRes.json();
        for (const cls of classes) {
          const cardsRes = await fetch(`/api/cards?classId=${cls.id}`);
          const cards = await cardsRes.json();
          if (cards.length > 0) {
            const div = document.createElement('div');
            div.innerHTML = `<h4>${game.name} - ${cls.name}</h4>`;
            const ul = document.createElement('ul');
            cards.forEach(c => {
              const li = document.createElement('li');
              li.textContent = `${c.id}: ${c.name} (L${c.level})`;
              ul.appendChild(li);
            });
            div.appendChild(ul);
            cardsList.appendChild(div);
          }
        }
      }
    } catch (e) {
      cardsList.textContent = 'Error loading cards';
    }
  }

  createCardForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    cardMessage.textContent = '';
    const classId = cardClassSelect.value;
    const name = cardNameInput.value.trim();
    const level = parseInt(cardLevelInput.value, 10);
    let imageData = '';
    const file = cardImageInput.files[0];
    if (file) {
      imageData = await readFileAsDataURL(file);
    }
    if (!name) {
      cardMessage.textContent = 'Card name required';
      return;
    }
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: parseInt(classId, 10), name, level, image: imageData })
      });
      const data = await res.json();
      if (res.ok) {
        cardMessage.style.color = 'green';
        cardMessage.textContent = 'Card added';
        createCardForm.reset();
        loadCardsList();
        loadCardSelectOptions();
      } else {
        cardMessage.style.color = 'red';
        cardMessage.textContent = data.error || 'Error adding card';
      }
    } catch (e) {
      cardMessage.style.color = 'red';
      cardMessage.textContent = 'Network error';
    }
  });

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Initialize
  (async () => {
    const ok = await ensureAdmin();
    if (!ok) return;
    await loadUsers();
    await loadGames();
    await loadCardsList();
  })();
});