# QuickList — Telegram Mini App MVP

Готовая статическая Mini App без бэкенда и без API-ключей. Она генерирует объявление из введённых данных прямо в браузере.

## Запуск за 0 ₽

### 1) GitHub
Создай бесплатный GitHub-аккаунт и новый **public** repository, например `quicklist-miniapp`.

Загрузи в корень репозитория:
- `index.html`
- `style.css`
- `app.js`
- `README.md`

### 2) GitHub Pages
В репозитории открой **Settings → Pages**.
Выбери публикацию из ветки `main`, папку `/ (root)` и сохрани.

Через некоторое время GitHub выдаст адрес вида:
`https://ТВОЙ-USERNAME.github.io/quicklist-miniapp/`

### 3) Telegram
Открой в Telegram **@BotFather**.
Создай бота командой `/newbot`.

Дальше настрой **Main Mini App** для бота и укажи URL GitHub Pages. Telegram официально поддерживает Main Mini Apps и Menu Button Mini Apps, а URL настраивается через @BotFather.

### 4) Проверка
Открой профиль бота и запусти приложение. Оно работает без отдельного сервера.

## Следующий этап монетизации

В эту MVP-версию специально не зашиты секретные ключи или платежные данные. После запуска можно добавить:
- PRO-доступ;
- лимит бесплатных генераций;
- историю объявлений;
- реферальную систему;
- Telegram Payments / Stars;
- серверную часть и базу данных;
- affiliate-блок.

## Важно
Никогда не размещай Bot Token в `index.html`, `app.js` или публичном GitHub-репозитории.
