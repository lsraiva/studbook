// Returning players keep the welcome page, with a direct path to their stable.
try {
  if (localStorage.getItem('hf:studbook:token')) {
    document.querySelectorAll('[data-start],[data-login]').forEach((link) => {
      link.href = '/play';
      link.textContent = 'Continuar meu estábulo ↗';
    });
  }
} catch { /* storage is optional on the public landing page */ }
