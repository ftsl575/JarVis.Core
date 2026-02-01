DOC_TYPE: NORMATIVE
DOC_SCOPE: CORE
DOC_STATUS: ACTIVE
DOC_ROLE: Consultant-window, Project-window, Codex-context

# Manual PR workflow

Интеграция для создания Pull Request иногда падает ("не удалось создать запрос на включение") и может ругаться на бинарные файлы. Чтобы работа была устойчивой, PR создаётся вручную через GitHub UI.

## Почему без авто‑PR
* Интеграции могут быть нестабильны и блокировать релиз.
* Предупреждения про бинарные файлы не должны ломать основной процесс.

## Рабочий процесс (ручной PR)
1) Создать новую ветку от `main`.
2) Внести изменения.
3) Проверить статус, тесты и отсутствие бинарников.
4) Закоммитить.
5) Запушить ветку в `origin`.
6) Создать PR вручную через GitHub UI.

## Чеклист перед push
- `git status`
- `git diff`
- тесты (если есть)
- проверка отсутствия бинарников: `npm run check:no-binaries`

## Название ветки
Формат: `codex/workflow-no-pr-manual-YYYYMMDD-short`

Пример:
```
codex/workflow-no-pr-manual-20260123-binary
```

## Как создать PR вручную
1) Открыть репозиторий на GitHub.
2) Появится баннер **Compare & pull request** для новой ветки.
3) Убедиться: base = `main`, compare = ваша ветка.
4) Нажать **Create pull request**.
