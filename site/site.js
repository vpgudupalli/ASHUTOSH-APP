// Ashutosh Services website: mobile menu, active nav link, contact form.
(function () {
  // Old app links looked like /#/join/CODE; send them to the app at /app.
  if (location.pathname === '/' && location.hash.startsWith('#/')) {
    location.replace('/app/' + location.hash);
    return;
  }

  const header = document.querySelector('.site-header');
  const menuBtn = document.querySelector('.menu-btn');
  if (menuBtn && header) {
    menuBtn.addEventListener('click', () => {
      const open = header.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
  }

  const here = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-links a').forEach((a) => {
    const href = a.getAttribute('href').replace(/\/$/, '') || '/';
    if (href === here) a.setAttribute('aria-current', 'page');
  });

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  // Preselect the topic from ?topic=demo links.
  const params = new URLSearchParams(location.search);
  const topicSelect = document.querySelector('select[name="topic"]');
  if (topicSelect && params.get('topic') === 'demo') topicSelect.value = 'Risk Navigator demo';
  if (topicSelect && params.get('topic') === 'services') topicSelect.value = 'Care management services';

  const form = document.querySelector('form[data-contact]');
  if (!form) return;
  const status = form.querySelector('[data-status]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    data.sourcePage = location.pathname;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    status.className = 'notice';
    status.hidden = true;
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
      form.reset();
      status.className = 'notice ok';
      status.textContent = 'Thank you! Your message was received. Our team will get back to you within 1–2 business days.';
    } catch (err) {
      status.className = 'notice err';
      status.textContent = err.message;
    } finally {
      status.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Send message';
    }
  });
})();
