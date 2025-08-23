document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const messageEl = document.getElementById('message');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    messageEl.textContent = '';
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        window.location.href = 'characters.html';
      } else {
        messageEl.textContent = data.error || 'Login failed';
      }
    } catch (e) {
      messageEl.textContent = 'Network error';
    }
  });
});