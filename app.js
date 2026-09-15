(() => {
  'use strict';

  console.log('[QuickList] app.js START');

  // =========================================================
  // TELEGRAM
  // =========================================================

  const tg = window.Telegram && window.Telegram.WebApp
    ? window.Telegram.WebApp
    : null;

  if (tg) {
    try {
      tg.ready();
      tg.expand();

      if (typeof tg.setHeaderColor === 'function') {
        tg.setHeaderColor('#07111f');
      }

      if (typeof tg.setBackgroundColor === 'function') {
        tg.setBackgroundColor('#07111f');
      }

      console.log('[QuickList] Telegram WebApp detected');
    } catch (error) {
      console.warn('[QuickList] Telegram init error:', error);
    }
  } else {
    console.warn('[QuickList] Telegram WebApp not detected');
  }

  // =========================================================
  // CONFIG
  // =========================================================

  const BACKEND_URL =
    'https://quicklist-backend.malorca6677.workers.dev';

  const STORAGE_KEY = 'quicklist_v3_state';
  const DAILY_LIMIT = 5;

  const PRODUCT = {
    id: 'pro_monthly',
    stars: 50,
    days: 30
  };

  // =========================================================
  // SAFE STORAGE
  // =========================================================

  function safeLoad() {
    try {
      if (!window.localStorage) {
        return {};
      }

      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);

      return parsed && typeof parsed === 'object'
        ? parsed
        : {};
    } catch (error) {
      console.warn('[QuickList] localStorage read error:', error);
      return {};
    }
  }

  function safeSave(data) {
    try {
      if (!window.localStorage) {
        return;
      }

      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(data)
      );
    } catch (error) {
      console.warn('[QuickList] localStorage write error:', error);
    }
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadState() {
    const saved = safeLoad();
    const today = todayKey();

    return {
      date: today,

      used:
        saved.date === today
          ? Number(saved.used || 0)
          : 0,

      history:
        Array.isArray(saved.history)
          ? saved.history
          : [],

      refs:
        Number(saved.refs || 0),

      pro:
        saved.pro === true,

      proExpiresAt:
        saved.proExpiresAt || null
    };
  }

  const state = loadState();

  let lastResult = null;
  let entitlementLoading = false;

  function persist() {
    safeSave(state);
    updateUI();
  }

  // =========================================================
  // DOM
  // =========================================================

  function $(id) {
    return document.getElementById(id);
  }

  const els = {
    tabs: Array.from(document.querySelectorAll('.tab')),
    panels: Array.from(document.querySelectorAll('.tab-panel')),

    generate: $('generate'),
    topic: $('topic'),
    details: $('details'),
    mode: $('mode'),
    price: $('price'),
    currency: $('currency'),
    tone: $('tone'),
    audience: $('audience'),

    hint: $('hint'),
    result: $('result'),
    outTitle: $('outTitle'),
    outDescription: $('outDescription'),
    outTags: $('outTags'),

    copyAll: $('copyAll'),
    share: $('share'),
    saveAgain: $('saveAgain'),

    historyList: $('historyList'),
    emptyHistory: $('emptyHistory'),
    clearHistory: $('clearHistory'),

    freeCount: $('freeCount'),
    historyCount: $('historyCount'),
    proStatus: $('proStatus'),

    buyPro: $('buyPro'),
    paymentHint: $('paymentHint'),

    profileBtn: $('profileBtn'),
    profileAvatar: $('profileAvatar'),
    profileName: $('profileName'),
    profileUsername: $('profileUsername'),
    profilePlan: $('profilePlan'),
    profileUsed: $('profileUsed'),
    profileSaved: $('profileSaved'),
    profileRefs: $('profileRefs'),

    refLink: $('refLink'),
    shareRef: $('shareRef'),

    toast: $('toast')
  };

  console.log('[QuickList] DOM loaded');
  console.log('[QuickList] generate button:', !!els.generate);
  console.log('[QuickList] buyPro button:', !!els.buyPro);

  // =========================================================
  // TOAST
  // =========================================================

  function toast(message) {
    console.log('[QuickList] toast:', message);

    if (!els.toast) {
      return;
    }

    els.toast.textContent = String(message);
    els.toast.classList.add('show');

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
      els.toast.classList.remove('show');
    }, 2500);
  }

  // =========================================================
  // PRO
  // =========================================================

  function hasLocalPro() {
    if (state.pro !== true) {
      return false;
    }

    if (!state.proExpiresAt) {
      return true;
    }

    const expires = new Date(
      state.proExpiresAt
    ).getTime();

    if (!Number.isFinite(expires)) {
      state.pro = false;
      state.proExpiresAt = null;
      safeSave(state);
      return false;
    }

    if (expires <= Date.now()) {
      state.pro = false;
      state.proExpiresAt = null;
      safeSave(state);
      return false;
    }

    return true;
  }

  function activateLocalPro(expiresAt) {
    state.pro = true;

    if (expiresAt) {
      state.proExpiresAt = expiresAt;
    } else {
      state.proExpiresAt =
        new Date(
          Date.now() +
          PRODUCT.days * 24 * 60 * 60 * 1000
        ).toISOString();
    }

    safeSave(state);
    updateUI();
  }

  // =========================================================
  // TELEGRAM DATA
  // =========================================================

  function getTelegramUser() {
    try {
      return tg &&
        tg.initDataUnsafe &&
        tg.initDataUnsafe.user
        ? tg.initDataUnsafe.user
        : null;
    } catch (_) {
      return null;
    }
  }

  function getInitData() {
    try {
      return tg && typeof tg.initData === 'string'
        ? tg.initData
        : '';
    } catch (_) {
      return '';
    }
  }

  // =========================================================
  // USER UI
  // =========================================================

  function renderUser() {
    if (!els.profileName) {
      return;
    }

    const user = getTelegramUser();

    if (!user) {
      els.profileName.textContent = 'Гость';

      if (els.profileUsername) {
        els.profileUsername.textContent =
          'Открой QuickList внутри Telegram';
      }

      if (els.profileAvatar) {
        els.profileAvatar.textContent = '?';
      }

      if (els.profileBtn) {
        els.profileBtn.textContent = '?';
      }

      return;
    }

    const name =
      (user.first_name || 'Пользователь') +
      (user.last_name
        ? ` ${user.last_name}`
        : '');

    els.profileName.textContent = name;

    if (els.profileUsername) {
      els.profileUsername.textContent =
        user.username
          ? `@${user.username}`
          : 'Telegram пользователь';
    }

    const letter =
      (user.first_name || 'Q')
        .slice(0, 1)
        .toUpperCase();

    if (els.profileAvatar) {
      els.profileAvatar.textContent = letter;
    }

    if (els.profileBtn) {
      els.profileBtn.textContent = letter;
    }
  }

  // =========================================================
  // REFERRAL
  // =========================================================

  function buildReferral() {
    if (!els.refLink) {
      return;
    }

    const user = getTelegramUser();
    const id = user && user.id
      ? user.id
      : 'demo';

    const botUsername = 'quicklisttakebot';

    const link =
      `https://t.me/${botUsername}?startapp=ref_${id}`;

    els.refLink.textContent = link;

    if (els.shareRef) {
      els.shareRef.dataset.link = link;
    }
  }

  // =========================================================
  // UI UPDATE
  // =========================================================

  function updateUI() {
    try {
      const pro = hasLocalPro();

      const remaining = pro
        ? '∞'
        : Math.max(
            0,
            DAILY_LIMIT - state.used
          );

      if (els.freeCount) {
        els.freeCount.textContent = remaining;
      }

      if (els.historyCount) {
        els.historyCount.textContent =
          String(state.history.length);
      }

      if (els.proStatus) {
        els.proStatus.textContent =
          pro ? 'PRO' : 'FREE';
      }

      if (els.profilePlan) {
        els.profilePlan.textContent =
          pro ? 'PRO' : 'FREE';
      }

      if (els.profileUsed) {
        els.profileUsed.textContent =
          pro
            ? `${state.used} / ∞`
            : `${state.used} / ${DAILY_LIMIT}`;
      }

      if (els.profileSaved) {
        els.profileSaved.textContent =
          String(state.history.length);
      }

      if (els.profileRefs) {
        els.profileRefs.textContent =
          String(state.refs);
      }

      if (els.hint) {
        els.hint.textContent = pro
          ? 'PRO активен — генерации без дневного лимита.'
          : `Бесплатно: ${DAILY_LIMIT} генераций в сутки.`;
      }

      if (els.paymentHint) {
        els.paymentHint.textContent = pro
          ? (
              state.proExpiresAt
                ? `PRO активен до ${formatDate(state.proExpiresAt)}`
                : 'PRO активен на 30 дней.'
            )
          : `PRO — ${PRODUCT.stars} ⭐ на ${PRODUCT.days} дней`;
      }

      if (els.buyPro) {
        if (pro) {
          els.buyPro.textContent = '✓ PRO активен';
          els.buyPro.disabled = true;
          els.buyPro.classList.add('active');
        } else {
          els.buyPro.textContent =
            `⭐ Подключить PRO · ${PRODUCT.stars}`;

          els.buyPro.disabled = false;
          els.buyPro.classList.remove('active');
        }
      }

      renderUser();
      renderHistory();
      buildReferral();

    } catch (error) {
      console.error(
        '[QuickList] updateUI error:',
        error
      );
    }
  }

  function formatDate(value) {
    try {
      return new Date(value).toLocaleDateString(
        'ru-RU',
        {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }
      );
    } catch (_) {
      return '';
    }
  }

  // =========================================================
  // BACKEND
  // =========================================================

  async function backend(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const response = await fetch(
      `${BACKEND_URL}${path}`,
      {
        ...options,
        headers
      }
    );

    let data = null;

    try {
      data = await response.json();
    } catch (_) {}

    if (!response.ok) {
      throw new Error(
        data && data.error
          ? data.error
          : `HTTP ${response.status}`
      );
    }

    return data;
  }

  // =========================================================
  // ENTITLEMENT
  // =========================================================

  async function syncEntitlement() {
    if (entitlementLoading) {
      return;
    }

    const initData = getInitData();

    if (!initData) {
      console.log(
        '[QuickList] No Telegram initData, entitlement skipped'
      );
      return;
    }

    entitlementLoading = true;

    try {
      console.log(
        '[QuickList] Checking PRO entitlement...'
      );

      const data = await backend(
        '/entitlement',
        {
          method: 'POST',
          body: JSON.stringify({
            initData
          })
        }
      );

      const entitlement =
        data && (
          data.entitlement ||
          data.result ||
          data
        );

      const active =
        entitlement &&
        (
          entitlement.active === true ||
          entitlement.pro === true ||
          entitlement.status === 'active' ||
          entitlement.plan === 'PRO'
        );

      if (active) {
        activateLocalPro(
          entitlement.expiresAt ||
          entitlement.expires_at ||
          entitlement.expirationDate ||
          entitlement.expiration_date ||
          null
        );
      } else {
        state.pro = false;
        state.proExpiresAt = null;
        safeSave(state);
        updateUI();
      }

    } catch (error) {
      console.warn(
        '[QuickList] Entitlement error:',
        error
      );
    } finally {
      entitlementLoading = false;
      updateUI();
    }
  }

  // =========================================================
  // GENERATOR
  // =========================================================

  function canGenerate() {
    return (
      hasLocalPro() ||
      state.used < DAILY_LIMIT
    );
  }

  function makeTags(text, mode) {
    const words = [
      ...new Set(
        String(text)
          .toLowerCase()
          .replace(
            /[^a-zа-яё0-9\s]/gi,
            ' '
          )
          .split(/\s+/)
          .filter(
            word => word.length > 3
          )
      )
    ].slice(0, 7);

    const base =
      mode === 'hook'
        ? [
            '#shorts',
            '#reels',
            '#content'
          ]
        : [
            '#объявление',
            '#товар',
            '#продажа'
          ];

    return [
      ...base,
      ...words
        .slice(0, 4)
        .map(word => `#${word}`)
    ].join(' ');
  }

  function generateContent() {
    const topic = els.topic
      ? els.topic.value.trim()
      : '';

    const details = els.details
      ? els.details.value.trim()
      : '';

    const price = els.price
      ? els.price.value.trim()
      : '';

    const currency = els.currency
      ? els.currency.value
      : '₽';

    const mode = els.mode
      ? els.mode.value
      : 'listing';

    const tone = els.tone
      ? els.tone.value
      : 'clear';

    if (!topic) {
      toast('Напиши тему или товар');

      if (els.topic) {
        els.topic.focus();
      }

      return null;
    }

    const priceLine = price
      ? ` Цена: ${price} ${currency}.`
      : '';

    const cleanDetails =
      details ||
      'практичное решение с понятными преимуществами';

    let title = '';
    let body = '';

    if (mode === 'listing') {
      const toneWord =
        {
          clear: 'Чёткое',
          friendly: 'Отличное',
          premium: 'Премиальное',
          fast: 'Срочное'
        }[tone] || 'Отличное';

      title =
        `${toneWord} предложение: ${topic}`;

      body =
        `${topic} — ${cleanDetails}.${priceLine}

Почему стоит посмотреть: понятные характеристики, удобная подача и акцент на том, что действительно важно покупателю.

Пишите в Telegram, чтобы уточнить детали и договориться.`;

    } else if (mode === 'social') {
      title =
        `🔥 ${topic}: коротко о главном`;

      body =
        `${topic} — ${cleanDetails}.${priceLine}

Вот что стоит знать: показываем пользу, убираем лишнее и даём человеку понятную причину попробовать или купить.

Сохрани пост и отправь тому, кому это пригодится.`;

    } else if (mode === 'hook') {
      title =
        `3 hook-идеи для ${topic}`;

      body =
        `1) «Ты всё ещё тратишь время на ${topic.toLowerCase()}? Вот способ проще».

2) «Я проверил ${topic.toLowerCase()} — вот что реально важно».

3) «90% людей делают это неправильно: ${topic.toLowerCase()} можно быстрее».`;

    } else {
      title =
        `${topic} — главное за 10 секунд`;

      body =
        `${topic}: ${cleanDetails}.${priceLine}

Идея проста: выделить одну сильную пользу, убрать лишнее и дать человеку понятный следующий шаг.`;
    }

    return {
      title,
      description: body,
      tags: makeTags(
        `${topic} ${details}`,
        mode
      ),
      mode,
      topic,
      at: new Date().toISOString()
    };
  }

  function renderResult(result) {
    if (!result) {
      return;
    }

    if (els.outTitle) {
      els.outTitle.textContent = result.title;
    }

    if (els.outDescription) {
      els.outDescription.textContent =
        result.description;
    }

    if (els.outTags) {
      els.outTags.textContent =
        result.tags;
    }

    if (els.result) {
      els.result.classList.remove('hidden');

      try {
        els.result.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      } catch (_) {}
    }

    lastResult = result;
  }

  // =========================================================
  // HISTORY
  // =========================================================

  function addHistory(result) {
    if (!result) {
      return;
    }

    state.history.unshift(result);
    state.history =
      state.history.slice(0, 30);

    safeSave(state);
    updateUI();
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>'"]/g,
      char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[char]
    );
  }

  function renderHistory() {
    if (!els.historyList || !els.emptyHistory) {
      return;
    }

    els.emptyHistory.style.display =
      state.history.length
        ? 'none'
        : 'block';

    els.historyList.innerHTML =
      state.history.map(
        (result, index) => `
          <div class="history-item">
            <div class="meta">
              <span>
                ${new Date(result.at).toLocaleString(
                  'ru-RU',
                  {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  }
                )}
              </span>

              <span>
                ${escapeHtml(result.mode)}
              </span>
            </div>

            <h3>
              ${escapeHtml(result.title)}
            </h3>

            <p>
              ${escapeHtml(result.description)}
            </p>

            <button
              class="mini-copy"
              data-history="${index}"
            >
              Копировать
            </button>
          </div>
        `
      ).join('');

    els.historyList
      .querySelectorAll('[data-history]')
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            const index =
              Number(button.dataset.history);

            const result =
              state.history[index];

            if (!result) {
              return;
            }

            copyText(
              `${result.title}

${result.description}

${result.tags}`,
              'Скопировано'
            );
          }
        );
      });
  }

  // =========================================================
  // COPY
  // =========================================================

  async function copyText(
    text,
    message = 'Готово'
  ) {
    try {
      if (
        navigator.clipboard &&
        navigator.clipboard.writeText
      ) {
        await navigator.clipboard.writeText(text);
        toast(message);
        return;
      }
    } catch (error) {
      console.warn(
        '[QuickList] Clipboard error:',
        error
      );
    }

    toast('Скопируй текст вручную');
  }

  // =========================================================
  // SHARE
  // =========================================================

  function shareText(text) {
    const url =
      `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;

    try {
      if (
        tg &&
        typeof tg.openTelegramLink === 'function'
      ) {
        tg.openTelegramLink(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error(
        '[QuickList] Share error:',
        error
      );
    }
  }

  // =========================================================
  // TABS
  // =========================================================

  function switchTab(name) {
    els.tabs.forEach(tab => {
      tab.classList.toggle(
        'active',
        tab.dataset.tab === name
      );
    });

    els.panels.forEach(panel => {
      panel.classList.toggle(
        'active',
        panel.id === `tab-${name}`
      );
    });

    try {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } catch (_) {}
  }

  // =========================================================
  // PAYMENT
  // =========================================================

  async function buyPro() {
    console.log('[QuickList] BUY PRO CLICK');

    if (hasLocalPro()) {
      toast('PRO уже активен');
      return;
    }

    if (!tg) {
      toast('Открой QuickList внутри Telegram');
      return;
    }

    const initData = getInitData();

    if (!initData) {
      toast('Не удалось получить Telegram данные');
      console.error(
        '[QuickList] Telegram initData is empty'
      );
      return;
    }

    if (!els.buyPro) {
      console.error(
        '[QuickList] buyPro element missing'
      );
      return;
    }

    const originalText =
      els.buyPro.textContent;

    els.buyPro.disabled = true;
    els.buyPro.textContent =
      '⏳ Создаём счёт...';

    try {
      console.log(
        '[QuickList] Sending /create-invoice'
      );

      const data =
        await backend(
          '/create-invoice',
          {
            method: 'POST',
            body: JSON.stringify({
              product: PRODUCT.id,
              initData
            })
          }
        );

      console.log(
        '[QuickList] Invoice response:',
        data
      );

      const invoiceUrl =
        data &&
        (
          data.url ||
          data.invoice_url ||
          (
            data.result &&
            data.result.url
          )
        );

      if (!invoiceUrl) {
        throw new Error(
          'Invoice URL missing'
        );
      }

      if (
        typeof tg.openInvoice !== 'function'
      ) {
        toast(
          'Telegram не поддерживает оплату в этом окне'
        );

        els.buyPro.disabled = false;
        els.buyPro.textContent =
          originalText;

        return;
      }

      console.log(
        '[QuickList] Opening invoice'
      );

      tg.openInvoice(
        invoiceUrl,
        async status => {
          console.log(
            '[QuickList] Payment status:',
            status
          );

          if (status === 'paid') {
            toast('🎉 Оплата прошла!');

            els.buyPro.textContent =
              '⏳ Проверяем PRO...';

            await new Promise(
              resolve =>
                setTimeout(resolve, 1500)
            );

            await syncEntitlement();

            if (!hasLocalPro()) {
              await new Promise(
                resolve =>
                  setTimeout(resolve, 2000)
              );

              await syncEntitlement();
            }

            if (hasLocalPro()) {
              toast(
                '⭐ PRO успешно активирован!'
              );
            } else {
              toast(
                'Оплата получена. PRO активируется через несколько секунд.'
              );
            }

          } else if (status === 'cancelled') {
            toast('Оплата отменена');

          } else if (status === 'failed') {
            toast('Не удалось провести оплату');

          } else if (status === 'pending') {
            toast('Платёж ещё обрабатывается');
          }

          updateUI();
        }
      );

    } catch (error) {
      console.error(
        '[QuickList] Payment error:',
        error
      );

      toast(
        `Ошибка оплаты: ${error.message || 'неизвестная ошибка'}`
      );

      els.buyPro.disabled = false;
      els.buyPro.textContent =
        originalText;
    }
  }

  // =========================================================
  // EVENTS
  // =========================================================

  console.log('[QuickList] Registering events...');

  // Tabs

  els.tabs.forEach(tab => {
    tab.addEventListener(
      'click',
      () => {
        console.log(
          '[QuickList] Tab click:',
          tab.dataset.tab
        );

        switchTab(tab.dataset.tab);
      }
    );
  });

  // Generate

  if (els.generate) {
    els.generate.addEventListener(
      'click',
      () => {
        console.log(
          '[QuickList] GENERATE CLICK'
        );

        try {
          if (!canGenerate()) {
            toast(
              'Лимит FREE исчерпан — подключи PRO'
            );

            switchTab('profile');
            return;
          }

          const result =
            generateContent();

          if (!result) {
            return;
          }

          if (!hasLocalPro()) {
            state.used += 1;
          }

          addHistory(result);
          renderResult(result);

          toast('✨ Текст создан!');
        } catch (error) {
          console.error(
            '[QuickList] Generate error:',
            error
          );

          toast(
            'Ошибка генерации: ' +
            (error.message || 'неизвестная ошибка')
          );
        }
      }
    );

    console.log(
      '[QuickList] Generate event attached'
    );
  } else {
    console.error(
      '[QuickList] Generate button NOT FOUND'
    );
  }

  // Copy all

  if (els.copyAll) {
    els.copyAll.addEventListener(
      'click',
      () => {
        if (!lastResult) {
          toast('Сначала создай текст');
          return;
        }

        copyText(
          `${lastResult.title}

${lastResult.description}

${lastResult.tags}`,
          'Всё скопировано'
        );
      }
    );
  }

  // Mini copy

  document
    .querySelectorAll('.mini-copy[data-target]')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const target =
            $(button.dataset.target);

          if (!target) {
            return;
          }

          copyText(
            target.textContent,
            'Скопировано'
          );
        }
      );
    });

  // Share

  if (els.share) {
    els.share.addEventListener(
      'click',
      () => {
        if (!lastResult) {
          toast('Сначала создай текст');
          return;
        }

        shareText(
          `${lastResult.title}

${lastResult.description}

${lastResult.tags}`
        );
      }
    );
  }

  // Save

  if (els.saveAgain) {
    els.saveAgain.addEventListener(
      'click',
      () => {
        if (!lastResult) {
          toast('Сначала создай текст');
          return;
        }

        addHistory(lastResult);
        toast('Сохранено в истории');
      }
    );
  }

  // Clear history

  if (els.clearHistory) {
    els.clearHistory.addEventListener(
      'click',
      () => {
        state.history = [];
        safeSave(state);
        updateUI();
        toast('История очищена');
      }
    );
  }

  // Profile

  if (els.profileBtn) {
    els.profileBtn.addEventListener(
      'click',
      () => {
        switchTab('profile');
      }
    );
  }

  // PRO

  if (els.buyPro) {
    els.buyPro.addEventListener(
      'click',
      buyPro
    );

    console.log(
      '[QuickList] PRO event attached'
    );
  } else {
    console.error(
      '[QuickList] PRO button NOT FOUND'
    );
  }

  // Referral

  if (els.shareRef) {
    els.shareRef.addEventListener(
      'click',
      () => {
        const link =
          els.shareRef.dataset.link;

        if (
          link &&
          !link.startsWith('Подключи')
        ) {
          shareText(
            `🚀 Попробуй QuickList\n\n${link}`
          );
        } else {
          toast(
            'Сначала подключи username бота'
          );
        }
      }
    );
  }

  // =========================================================
  // START
  // =========================================================

  try {
    updateUI();
  } catch (error) {
    console.error(
      '[QuickList] Initial UI error:',
      error
    );
  }

  /*
   * ВАЖНО:
   * Проверка PRO запускается отдельно.
   * Если backend сломан, интерфейс всё равно работает.
   */
  setTimeout(() => {
    syncEntitlement();
  }, 300);

  console.log(
    '[QuickList] app.js READY'
  );

})();
