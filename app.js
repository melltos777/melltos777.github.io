(() => {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('#0d0f12'); tg.setBackgroundColor('#0d0f12'); } catch (_) {}
  }

  const $ = (id) => document.getElementById(id);
  const product = $('product');
  const details = $('details');
  const price = $('price');
  const currency = $('currency');
  const tone = $('tone');
  const result = $('result');
  const hint = $('hint');

  function words(input) {
    return input.toLowerCase().replace(/[^a-zа-яё0-9]+/gi,' ').trim().split(/\s+/).filter(Boolean);
  }

  function makeTitle(name, priceText) {
    const clean = name.trim().replace(/\s+/g,' ');
    const tail = priceText ? ` • ${priceText}` : '';
    return clean.length > 55 ? clean.slice(0,52) + '…' + tail : `${clean}${tail}`;
  }

  function makeDescription(name, detailsText, priceText, style) {
    const d = detailsText.trim().replace(/\s+/g,' ');
    const p = priceText ? `Цена: ${priceText}.` : '';
    if (style === 'premium') return `Продаю ${name.trim()}.\n\n${d || 'Аккуратное состояние, готов к передаче покупателю.'}\n\n${p}`.trim();
    if (style === 'friendly') return `Продаю ${name.trim()} 😊\n${d || 'Состояние хорошее, всё работает как надо.'}\n${p}`.trim();
    if (style === 'fast') return `⚡ ${name.trim()}\n${d || 'Хорошее состояние.'} ${p}`.trim();
    return `Продаю ${name.trim()}.\n\n${d || 'Хорошее состояние, всё работает исправно.'}\n\n${p}`.trim();
  }

  function makeTags(name) {
    const base = words(name).slice(0,5).map(w => `#${w}`).join(' ');
    const generic = '#продажа #объявление #купить';
    return `${base} ${generic}`.trim();
  }

  function generate() {
    const name = product.value.trim();
    if (!name) {
      hint.textContent = 'Впиши название товара — например, «iPhone 13 128GB».';
      product.focus();
      return;
    }
    const priceText = price.value.trim() ? `${price.value.trim()} ${currency.value}` : '';
    $('outTitle').textContent = makeTitle(name, priceText);
    $('outDescription').textContent = makeDescription(name, details.value, priceText, tone.value);
    $('outTags').textContent = makeTags(name);
    result.classList.remove('hidden');
    hint.textContent = 'Готово. Можно копировать отдельные блоки или всё сразу.';
    result.scrollIntoView({behavior:'smooth', block:'start'});
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  }

  function copyText(text, button) {
    navigator.clipboard?.writeText(text).then(() => {
      const old = button.textContent; button.textContent = 'Скопировано ✓';
      setTimeout(() => button.textContent = old, 1200);
    }).catch(() => {
      const area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select();
      document.execCommand('copy'); area.remove();
      button.textContent = 'Скопировано ✓'; setTimeout(() => button.textContent = 'Скопировать', 1200);
    });
  }

  $('generate').addEventListener('click', generate);
  [product,details,price].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); }}));

  document.querySelectorAll('.mini-copy').forEach(btn => {
    btn.addEventListener('click', () => copyText($(btn.dataset.target).textContent, btn));
  });

  $('copyAll').addEventListener('click', (e) => {
    const text = `ЗАГОЛОВОК\n${$('outTitle').textContent}\n\nОПИСАНИЕ\n${$('outDescription').textContent}\n\nТЕГИ\n${$('outTags').textContent}`;
    copyText(text, e.currentTarget);
  });

  $('share').addEventListener('click', () => {
    const text = `${$('outTitle').textContent}\n\n${$('outDescription').textContent}\n\n${$('outTags').textContent}`;
    const url = `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
  });
})();
