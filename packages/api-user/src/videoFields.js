const {
  VIDEO_VISIBILITY,
  VIDEO_TITLE_MAX,
  VIDEO_DESCRIPTION_MAX,
} = require('db');

function validateTitle(title) {
  const t = String(title || '').trim();
  if (t.length < 1 || t.length > VIDEO_TITLE_MAX) {
    return `Название: от 1 до ${VIDEO_TITLE_MAX} символов`;
  }
  return null;
}

function validateDescription(description) {
  const d = String(description ?? '').trim();
  if (d.length > VIDEO_DESCRIPTION_MAX) {
    return `Описание: до ${VIDEO_DESCRIPTION_MAX} символов`;
  }
  return null;
}

function parseDescription(description) {
  return String(description ?? '').trim();
}

function parseVisibility(raw, { allowPrivate }) {
  const v = String(raw || VIDEO_VISIBILITY.PUBLIC).trim().toLowerCase();
  if (v === VIDEO_VISIBILITY.PRIVATE) {
    if (!allowPrivate) {
      return {
        err: 'Скрытые видео доступны только при загрузке под аккаунтом',
        value: VIDEO_VISIBILITY.PUBLIC,
      };
    }
    return { value: VIDEO_VISIBILITY.PRIVATE };
  }
  if (v !== VIDEO_VISIBILITY.PUBLIC) {
    return { err: 'Некорректная видимость', value: null };
  }
  return { value: VIDEO_VISIBILITY.PUBLIC };
}

module.exports = {
  validateTitle,
  validateDescription,
  parseDescription,
  parseVisibility,
};
