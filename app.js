(() => {
  'use strict';

  /*
   * QUICKLIST — APP.JS
   * Telegram Mini App + Cloudflare Worker + Telegram Stars
   */

  const tg = window.Telegram?.WebApp;

  if (tg) {
    try {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#07111f');
      tg.setBackgroundColor('#07111f');
    } catch (_) {}
  }

  // =========================================================
  // CONFIG
  // =========================================================

  const BACKEND_URL =
    'https://quicklist-backend.malorca6677.workers.dev';

  const STORAGE = 'quicklist_v3_state';
  const DAILY_LIMIT = 5;

  const PRODUCT = {
    id: 'pro_monthly',
    stars: 50,
    days: 30
  };

  // =========================================================
  // STATE
  // =========================================================

  const state = loadState();

  let lastResult = null;
  let entitlementLoading = false;

  // =========================================================
  // DOM
  // =========================================================

  const $ = id => document.getElementById(id);

  const els = {
    tabs: [...document.querySelectorAll('.tab')],
    panels: [...document.querySelectorAll('.tab-panel')],

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

  // =========================================================
  // STORAGE
  // =========================================================

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE);
      const saved = raw ? JSON.parse(raw) : {};

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
          !!saved.pro,

        proExpiresAt:
          saved.proExpiresAt || null
      };
    } catch (_) {
      return {
        date: todayKey(),
        used: 0,
        history: [],
        refs: 0,
        pro: false,
        proExpiresAt: null
      };
    }
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify(state)
      );
    } catch (_) {}

    updateUI();
  }

  // =========================================================
  // PRO STATUS
  // =========================================================

  function hasLocalPro() {
    if (!state.pro) return false;

    if (!state.proExpiresAt) {
      return true;
    }

    const expires =
      new Date(state.proExpiresAt).getTime();

    if (!Number.isFinite(expires)) {
      return false;
    }

    if (expires <= Date.now()) {
      state.pro = false;
      state.proExpiresAt = null;

      try {
        localStorage.setItem(
          STORAGE,
          JSON.stringify(state)
        );
      } catch (_) {}

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

    persist();
  }

  // =========================================================
  // TELEGRAM USER
  // =========================================================

  function getTelegramUser() {
    return tg?.initDataUnsafe?.user || null;
  }

  function getInitData() {
    return tg?.initData || '';
  }

  function renderUser() {
    const user = getTelegramUser();

    if (!user) {
      els.profileName.textContent = 'Гость';
      els.profileUsername.textContent =
        'Открой QuickList внутри Telegram';

      els.profileAvatar.textContent = '?';
      els.profileBtn.textContent = '?';

      return;
    }

    const name =
      (user.first_name || 'Пользователь') +
      (user.last_name
        ? ` ${user.last_name}`
        : '');

    els.profileName.textContent = name;

    els.profileUsername.textContent =
      user.username
        ? `@${user.username}`
        : 'Telegram пользователь';

    const letter =
      (user.first_name || 'Q')
        .slice(0, 1)
        .toUpperCase();

    els.profileAvatar.textContent = letter;
    els.profileBtn.textContent = letter;
  }

  // =========================================================
  // REFERRAL
  // =========================================================

  function buildReferral() {
    const user = getTelegramUser();

    const id = user?.id || 'demo';

    /*
     * Username твоего Telegram-бота.
     * Без символа @
     */
    const botUsername = 'quicklisttakebot';

    const link =
      botUsername
        ? `https://t.me/${botUsername}?startapp=ref_${id}`
        : 'Подключи username бота';

    els.refLink.textContent = link;
    els.shareRef.dataset.link = link;
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
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      throw new Error(
        data?.error ||
        `HTTP ${response.status}`
      );
    }

    return data;
  }

  // =========================================================
  // ENTITLEMENT SYNC
  // =========================================================

  async function syncEntitlement() {
    if (entitlementLoading) return;

    entitlementLoading = true;

    try {
      const initData = getInitData();

      if (!initData) {
        return;
      }

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
        data?.entitlement ||
        data?.result ||
        data;

      const active =
        entitlement?.active === true ||
        entitlement?.pro === true ||
        entitlement?.status === 'active' ||
        entitlement?.plan === 'PRO';

      if (active) {
        activateLocalPro(
          entitlement?.expiresAt ||
          entitlement?.expires_at ||
          entitlement?.expirationDate ||
          entitlement?.expiration_date ||
          null
        );
      } else {
        state.pro = false;
        state.proExpiresAt = null;
        persist();
      }
    } catch (error) {
      console.warn(
        'Entitlement sync failed:',
        error
      );
    } finally {
      entitlementLoading = false;
      updateUI();
    }
  }

  // =========================================================
  // UI
  // =========================================================

  function updateUI() {
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
        state.history.length;
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
        state.history.length;
    }

    if (els.profileRefs) {
      els.profileRefs.textContent =
        state.refs;
    }

    if (pro) {
      if (els.hint) {
        els.hint.textContent =
          'PRO активен — генерации без дневного лимита.';
      }

      if (els.paymentHint) {
        els.paymentHint.textContent =
          state.proExpiresAt
            ? `PRO активен до ${formatDate(state.proExpiresAt)}`
            : 'PRO активен на 30 дней.';
      }

      if (els.buyPro) {
        els.buyPro.textContent =
          '✓ PRO активен';

        els.buyPro.disabled = true;
        els.buyPro.classList.add('active');
      }
    } else {
      if (els.hint) {
        els.hint.textContent =
          `Бесплатно: ${DAILY_LIMIT} генераций в сутки.`;
      }

      if (els.paymentHint) {
        els.paymentHint.textContent =
          `PRO — ${PRODUCT.stars} ⭐ на ${PRODUCT.days} дней`;
      }

      if (els.buyPro) {
        els.buyPro.textContent =
          `⭐ Подключить PRO · ${PRODUCT.stars}`;

        els.buyPro.disabled = false;
        els.buyPro.classList.remove('active');
      }
    }

    renderUser();
    renderHistory();
    buildReferral();
  }

  function formatDate(value) {
    try {
      return new Date(value)
        .toLocaleDateString(
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
  // TOAST
  // =========================================================

  function toast(message) {
    if (!els.toast) return;

    els.toast.textContent = message;
    els.toast.classList.add('show');

    clearTimeout(toast.timer);

    toast.timer =
      setTimeout(() => {
        els.toast.classList.remove('show');
      }, 2200);
  }

  // =========================================================
  // SECURITY / HTML
  // =========================================================

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>'"]/g,
      char =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        })[char]
    );
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
        text
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
    const topic =
      els.topic.value.trim();

    const details =
      els.details.value.trim();

    const price =
      els.price.value.trim();

    const cur =
      els.currency.value;

    const mode =
      els.mode.value;

    const tone =
      els.tone.value;

    if (!topic) {
      toast('Напиши тему или товар');
      els.topic.focus();
      return null;
    }

    const priceLine =
      price
        ? ` Цена: ${price} ${cur}.`
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
        }[tone];

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
    els.outTitle.textContent =
      result.title;

    els.outDescription.textContent =
      result.description;

    els.outTags.textContent =
      result.tags;

    els.result.classList.remove(
      'hidden'
    );

    lastResult = result;

    try {
      els.result.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    } catch (_) {}
  }

  // =========================================================
  // HISTORY
  // =========================================================

  function addHistory(result) {
    state.history.unshift(result);

    state.history =
      state.history.slice(0, 30);

    persist();
  }

  function renderHistory() {
    if (!els.emptyHistory || !els.historyList) {
      return;
    }

    els.emptyHistory.style.display =
      state.history.length
        ? 'none'
        : 'block';

    els.historyList.innerHTML =
      state.history
        .map(
          (result, index) => `
            <div class="history-item">
              <div class="meta">
                <span>
                  ${new Date(result.at)
                    .toLocaleString(
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
        )
        .join('');

    els.historyList
      .querySelectorAll(
        '[data-history]'
      )
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            const result =
              state.history[
                Number(
                  button.dataset.history
                )
              ];

            if (!result) return;

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
      await navigator.clipboard.writeText(
        text
      );

      toast(message);
    } catch (_) {
      toast(
        'Скопируй текст вручную'
      );
    }
  }

  // =========================================================
  // SHARE
  // =========================================================

  function shareText(text) {
    const url =
      `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(url);
    } else {
      window.open(
        url,
        '_blank'
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

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  // =========================================================
  // TELEGRAM STARS PAYMENT
  // =========================================================

  async function buyPro() {
    if (hasLocalPro()) {
      toast('PRO уже активен');
      return;
    }

    if (!tg) {
      toast(
        'Открой QuickList внутри Telegram'
      );
      return;
    }

    const initData =
      getInitData();

    if (!initData) {
      toast(
        'Не удалось получить Telegram данные'
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
        'QuickList: creating invoice...'
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
        'QuickList invoice response:',
        data
      );

      const invoiceUrl =
        data?.url ||
        data?.invoice_url ||
        data?.result?.url;

      if (!invoiceUrl) {
        throw new Error(
          'Invoice URL missing'
        );
      }

      console.log(
        'QuickList: opening Telegram invoice'
      );

      if (
        typeof tg.openInvoice !==
        'function'
      ) {
        toast(
          'Telegram не поддерживает оплату в этом окне'
        );

        console.log(
          'Invoice URL:',
          invoiceUrl
        );

        els.buyPro.disabled = false;
        els.buyPro.textContent =
          originalText;

        return;
      }

      tg.openInvoice(
        invoiceUrl,
        async status => {
          console.log(
            'Telegram payment status:',
            status
          );

          if (status === 'paid') {
            toast(
              '🎉 Оплата прошла!'
            );

            els.buyPro.textContent =
              '⏳ Проверяем PRO...';

            /*
             * Даём webhook время обработать
             * successful_payment.
             */
            await new Promise(
              resolve =>
                setTimeout(
                  resolve,
                  1500
                )
            );

            await syncEntitlement();

            /*
             * Если webhook ещё не успел,
             * пробуем ещё раз.
             */
            if (!hasLocalPro()) {
              await new Promise(
                resolve =>
                  setTimeout(
                    resolve,
                    2000
                  )
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

          } else if (
            status === 'cancelled'
          ) {
            toast(
              'Оплата отменена'
            );

          } else if (
            status === 'failed'
          ) {
            toast(
              'Не удалось провести оплату'
            );

          } else if (
            status === 'pending'
          ) {
            toast(
              'Платёж ещё обрабатывается'
            );
          }

          updateUI();
        }
      );

    } catch (error) {
      console.error(
        'QuickList payment error:',
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

  els.tabs.forEach(tab => {
    tab.addEventListener(
      'click',
      () => switchTab(
        tab.dataset.tab
      )
    );
  });

  if (els.generate) {
    els.generate.addEventListener(
      'click',
      () => {
        if (!canGenerate()) {
          toast(
            'Лимит FREE исчерпан — подключи PRO'
          );

          switchTab('profile');

          return;
        }

        const result =
          generateContent();

        if (!result) return;

        if (!hasLocalPro()) {
          state.used += 1;
        }

        addHistory(result);

        renderResult(result);

        persist();
      }
    );
  }

  if (els.copyAll) {
    els.copyAll.addEventListener(
      'click',
      () => {
        if (!lastResult) return;

        copyText(
          `${lastResult.title}

${lastResult.description}

${lastResult.tags}`,
          'Всё скопировано'
        );
      }
    );
  }

  document
    .querySelectorAll(
      '.mini-copy[data-target]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const target =
            $(button.dataset.target);

          if (!target) return;

          copyText(
            target.textContent,
            'Скопировано'
          );
        }
      );
    });

  if (els.share) {
    els.share.addEventListener(
      'click',
      () => {
        if (!lastResult) return;

        shareText(
          `${lastResult.title}

${lastResult.description}

${lastResult.tags}`
        );
      }
    );
  }

  if (els.saveAgain) {
    els.saveAgain.addEventListener(
      'click',
      () => {
        if (!lastResult) return;

        addHistory(lastResult);

        toast(
          'Сохранено в истории'
        );
      }
    );
  }

  if (els.clearHistory) {
    els.clearHistory.addEventListener(
      'click',
      () => {
        state.history = [];

        persist();

        toast(
          'История очищена'
        );
      }
    );
  }

  if (els.profileBtn) {
    els.profileBtn.addEventListener(
      'click',
      () => switchTab('profile')
    );
  }

  if (els.buyPro) {
    els.buyPro.addEventListener(
      'click',
      buyPro
    );
  }

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

  updateUI();

  /*
   * Синхронизируем PRO с D1
   * при каждом открытии Mini App.
   */
  syncEntitlement();

})();
