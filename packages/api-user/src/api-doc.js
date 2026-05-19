// OpenAPI 3 — источник правды для express-openapi (api-user)
module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'mvidia user API',
    version: '1.0.0',
  },
  servers: [{ url: '/' }],
  paths: {
    '/videos': {
      post: {
        operationId: 'createVideo',
        summary: 'Загрузить MP4',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'title'],
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Видеофайл .mp4',
                  },
                  title: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 500,
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Создано',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['publicId', 'title', 'sizeBytes', 'mimeType'],
                  properties: {
                    publicId: { type: 'string' },
                    title: { type: 'string' },
                    sizeBytes: { type: 'integer' },
                    mimeType: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Ошибка запроса',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { message: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
    '/videos/{publicId}': {
      get: {
        operationId: 'getVideoByPublicId',
        summary: 'Метаданные видео',
        parameters: [
          {
            name: 'publicId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1, maxLength: 64 },
          },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['publicId', 'title', 'sizeBytes', 'mimeType', 'createdAt'],
                  properties: {
                    publicId: { type: 'string' },
                    title: { type: 'string' },
                    sizeBytes: { type: 'integer' },
                    mimeType: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Не найдено',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { message: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
    '/videos/{publicId}/file': {
      get: {
        operationId: 'streamVideoFile',
        summary: 'Поток MP4 (поддержка Range)',
        'x-express-openapi-disable-response-validation-middleware': true,
        parameters: [
          {
            name: 'publicId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1, maxLength: 64 },
          },
        ],
        responses: {
          '200': { description: 'Полный файл' },
          '206': { description: 'Частичное содержимое' },
          '404': { description: 'Не найдено' },
          '416': { description: 'Недопустимый диапазон' },
        },
      },
    },
  },
};
