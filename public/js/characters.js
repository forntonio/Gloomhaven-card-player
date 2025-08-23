document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  const adminLink = document.getElementById('adminLink');
  const charactersList = document.getElementById('charactersList');
  const newCharForm = document.getElementById('newCharForm');
  const gameSelect = document.getElementById('gameSelect');
  const classSelect = document.getElementById('classSelect');
  const newCharMessage = document.getElementById('newCharMessage');

  // Logout: simply clear cookie by setting token to empty with expiration
  logoutBtn.addEventListener('click', () => {
    document.cookie = 'token=; Max-Age=0; Path=/';
    window.location.href = 'login.html';
  });

  async function fetchUser() {
    try {
      const res = await fetch('/api/user');
      if (res.status === 401) {
        window.location.href = 'login.html';
        return null;
      }
      const user = await res.json();
      if (user.role === 'admin') {
        adminLink.style.display = 'inline';
      }
      return user;
    } catch (e) {
      return null;
    }
  }

  async function fetchGames() {
    const res = await fetch('/api/games');
    const games = await res.json();
    return games;
  }

  async function fetchClasses(gameId) {
    const res = await fetch(`/api/classes?gameId=${gameId}`);
    const classes = await res.json();
    return classes;
  }

  async function loadGameAndClasses() {
    const games = await fetchGames();
    gameSelect.innerHTML = '';
    games.forEach(game => {
      const opt = document.createElement('option');
      opt.value = game.id;
      opt.textContent = game.name;
      gameSelect.appendChild(opt);
    });
    if (games.length > 0) {
      loadClassesForGame(games[0].id);
    }
  }

  async function loadClassesForGame(gameId) {
    const classes = await fetchClasses(gameId);
    classSelect.innerHTML = '';
    classes.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls.id;
      opt.textContent = cls.name;
      classSelect.appendChild(opt);
    });
  }

  gameSelect.addEventListener('change', () => {
    const gid = gameSelect.value;
    if (gid) loadClassesForGame(gid);
  });

  newCharForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    newCharMessage.textContent = '';
    const name = document.getElementById('charName').value.trim();
    const gameId = gameSelect.value;
    const classId = classSelect.value;
    const level = parseInt(document.getElementById('charLevel').value, 10);
    if (!name) {
      newCharMessage.textContent = 'Name required';
      return;
    }
    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, gameId: parseInt(gameId, 10), classId: parseInt(classId, 10), level })
      });
      const data = await res.json();
      if (res.ok) {
        newCharForm.reset();
        newCharMessage.style.color = 'green';
        newCharMessage.textContent = 'Character created';
        loadCharacters();
      } else {
        newCharMessage.style.color = 'red';
        newCharMessage.textContent = data.error || 'Error creating character';
      }
    } catch (e) {
      newCharMessage.style.color = 'red';
      newCharMessage.textContent = 'Network error';
    }
  });

  async function loadCharacters() {
    charactersList.innerHTML = '';
    try {
      const res = await fetch('/api/characters');
      const chars = await res.json();
      if (chars.length === 0) {
        charactersList.textContent = 'No characters yet.';
        return;
      }
      const ul = document.createElement('ul');
      chars.forEach(ch => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = `character.html?id=${ch.id}`;
        link.textContent = `${ch.name} (Level ${ch.level})`;
        li.appendChild(link);
        ul.appendChild(li);
      });
      charactersList.appendChild(ul);
    } catch (e) {
      charactersList.textContent = 'Error loading characters';
    }
  }

  // Initialize
  (async () => {
    await fetchUser();
    await loadGameAndClasses();
    await loadCharacters();
  })();
});